<?php
/**
 * SPDX-FileCopyrightText: 2026 kotoverse
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

namespace Relikes_WP;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest_Controller {
	private $storage;

	public function __construct( Storage $storage ) {
		$this->storage = $storage;
	}

	public function register_routes() {
		register_rest_route(
			'relikes/v1',
			'/session',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'create_session' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			'relikes/v1',
			'/reactions',
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => array( $this, 'save_reactions' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			'relikes/v1',
			'/heatmap',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'get_heatmap' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	public function create_session( \WP_REST_Request $request ) {
		$settings = Plugin::instance()->settings();
		if ( empty( $settings['allow_anonymous'] ) ) {
			return $this->error( 403, 'anonymous_disabled', __( 'Anonymous reactions are disabled.', 'relikes' ) );
		}
		if ( ! $this->rate_limit( 'session-ip', $this->request_ip(), 20, HOUR_IN_SECONDS ) ) {
			return $this->error( 429, 'rate_limited', __( 'Too many session requests. Please try again later.', 'relikes' ) );
		}

		$now     = time();
		$expires = $now + max( DAY_IN_SECONDS, absint( $settings['anonymous_retention_days'] ) * DAY_IN_SECONDS );
		$payload = array(
			'v'   => 1,
			'sid' => bin2hex( random_bytes( 24 ) ),
			'iat' => $now,
			'exp' => $expires,
		);

		return new \WP_REST_Response(
			array(
				'schema'      => 1,
				'subjectType' => 'anonymous',
				'token'       => $this->sign_token( $payload ),
				'expiresAt'   => gmdate( DATE_ATOM, $expires ),
			),
			201
		);
	}

	public function save_reactions( \WP_REST_Request $request ) {
		if ( strlen( (string) $request->get_body() ) > 131072 ) {
			return $this->error( 413, 'payload_too_large', __( 'The reaction snapshot is too large.', 'relikes' ) );
		}
		$subject = $this->resolve_subject( $request, true );
		if ( is_wp_error( $subject ) ) return $this->from_error( $subject );
		if ( ! $this->rate_limit( 'write-ip', $this->request_ip(), 120, HOUR_IN_SECONDS ) ||
			! $this->rate_limit( 'write-subject', $subject['key'], 60, HOUR_IN_SECONDS ) ) {
			return $this->error( 429, 'rate_limited', __( 'Too many reaction updates. Please try again later.', 'relikes' ) );
		}

		$snapshot = $this->validate_snapshot( $request->get_json_params() );
		if ( is_wp_error( $snapshot ) ) return $this->from_error( $snapshot );
		$scope = Plugin::instance()->document_scope( $snapshot['documentId'] );
		if ( is_wp_error( $scope ) ) return $this->from_error( $scope );

		$result = $this->storage->replace_snapshot( $snapshot, $subject );
		if ( is_wp_error( $result ) ) return $this->from_error( $result );

		return rest_ensure_response(
			array(
				'ok'              => true,
				'schema'          => 1,
				'documentId'      => $snapshot['documentId'],
				'documentVersion' => $snapshot['documentVersion'],
				'serverRevision'  => $result['serverRevision'],
				'clientRevision'  => $result['clientRevision'],
				'idempotent'      => $result['idempotent'],
			)
		);
	}

	public function get_heatmap( \WP_REST_Request $request ) {
		if ( ! $this->rate_limit( 'heatmap-ip', $this->request_ip(), 120, MINUTE_IN_SECONDS ) ) {
			return $this->error( 429, 'rate_limited', __( 'Too many heatmap requests. Please try again later.', 'relikes' ) );
		}

		$document_id      = sanitize_text_field( (string) $request->get_param( 'documentId' ) );
		$document_version = sanitize_text_field( (string) $request->get_param( 'documentVersion' ) );
		if ( ! $document_id || 'wp-v1' !== $document_version ) {
			return $this->error( 400, 'invalid_document', __( 'A valid document and version are required.', 'relikes' ) );
		}
		$scope = Plugin::instance()->document_scope( $document_id );
		if ( is_wp_error( $scope ) ) return $this->from_error( $scope );

		$excluded = '';
		if ( filter_var( $request->get_param( 'excludeCurrentUser' ), FILTER_VALIDATE_BOOLEAN ) ) {
			$subject = $this->resolve_subject( $request, false );
			if ( is_wp_error( $subject ) ) return $this->from_error( $subject );
			if ( $subject ) $excluded = $subject['key'];
		}

		$response = $this->storage->heatmap( $document_id, $document_version, $excluded );
		$rest     = rest_ensure_response( $response );
		$rest->header( 'Cache-Control', $excluded ? 'private, no-store' : 'public, max-age=60' );
		return $rest;
	}

	private function validate_snapshot( $payload ) {
		if ( ! is_array( $payload ) ) {
			return new \WP_Error( 'invalid_json', __( 'A JSON reaction snapshot is required.', 'relikes' ), array( 'status' => 400 ) );
		}

		$document_id      = sanitize_text_field( (string) ( $payload['documentId'] ?? '' ) );
		$document_version = sanitize_text_field( (string) ( $payload['documentVersion'] ?? '' ) );
		$content_length   = isset( $payload['contentLength'] ) ? absint( $payload['contentLength'] ) : 0;
		$client_revision  = isset( $payload['clientRevision'] ) ? absint( $payload['clientRevision'] ) : 0;
		$mutation_id      = sanitize_text_field( (string) ( $payload['mutationId'] ?? '' ) );

		if ( 1 !== (int) ( $payload['schema'] ?? 0 ) || ! $document_id || ! $document_version ||
			'wp-v1' !== $document_version || ! $content_length || $content_length > 2000000 ||
			! $client_revision || ! preg_match( '/^[A-Za-z0-9._:-]{8,64}$/', $mutation_id ) ) {
			return new \WP_Error( 'invalid_snapshot', __( 'The reaction snapshot is invalid.', 'relikes' ), array( 'status' => 400 ) );
		}

		$by_kind = array( 'like' => array(), 'dislike' => array() );
		$run_count = 0;
		foreach ( (array) ( $payload['reactions'] ?? array() ) as $reaction ) {
			$kind = isset( $reaction['kind'] ) ? (string) $reaction['kind'] : '';
			if ( ! isset( $by_kind[ $kind ] ) || ! is_array( $reaction['runs'] ?? null ) ) {
				return new \WP_Error( 'invalid_reaction', __( 'Each reaction must contain valid ranges.', 'relikes' ), array( 'status' => 400 ) );
			}

			foreach ( $reaction['runs'] as $run ) {
				$start = isset( $run['start'] ) ? (int) $run['start'] : -1;
				$end   = isset( $run['end'] ) ? (int) $run['end'] : -1;
				if ( $start < 0 || $end <= $start || $end > $content_length ) {
					return new \WP_Error( 'invalid_range', __( 'A reaction range falls outside the selectable text.', 'relikes' ), array( 'status' => 400 ) );
				}
				$by_kind[ $kind ][] = array( 'start' => $start, 'end' => $end );
				$run_count++;
				if ( $run_count > 250 ) {
					return new \WP_Error( 'too_many_ranges', __( 'This snapshot contains too many reaction ranges.', 'relikes' ), array( 'status' => 413 ) );
				}
			}
		}

		$by_kind['like']    = $this->normalize_runs( $by_kind['like'] );
		$by_kind['dislike'] = $this->normalize_runs( $by_kind['dislike'] );
		if ( $this->ranges_overlap( $by_kind['like'], $by_kind['dislike'] ) ) {
			return new \WP_Error( 'conflicting_reactions', __( 'The same reader cannot like and dislike the same text.', 'relikes' ), array( 'status' => 400 ) );
		}

		$reactions = array();
		foreach ( array( 'like', 'dislike' ) as $kind ) {
			if ( $by_kind[ $kind ] ) $reactions[] = array( 'kind' => $kind, 'runs' => $by_kind[ $kind ] );
		}

		return array(
			'schema'          => 1,
			'documentId'      => $document_id,
			'documentVersion' => $document_version,
			'contentLength'   => $content_length,
			'clientRevision'  => $client_revision,
			'mutationId'      => $mutation_id,
			'reactions'       => $reactions,
		);
	}

	private function normalize_runs( array $runs ) {
		usort( $runs, function ( $left, $right ) {
			return $left['start'] === $right['start'] ? $left['end'] <=> $right['end'] : $left['start'] <=> $right['start'];
		} );
		$normalized = array();
		foreach ( $runs as $run ) {
			$last = count( $normalized ) - 1;
			if ( $last >= 0 && $run['start'] <= $normalized[ $last ]['end'] ) {
				$normalized[ $last ]['end'] = max( $normalized[ $last ]['end'], $run['end'] );
			} else {
				$normalized[] = $run;
			}
		}
		return $normalized;
	}

	private function ranges_overlap( array $left, array $right ) {
		$i = 0;
		$j = 0;
		while ( isset( $left[ $i ], $right[ $j ] ) ) {
			if ( $left[ $i ]['start'] < $right[ $j ]['end'] && $right[ $j ]['start'] < $left[ $i ]['end'] ) return true;
			if ( $left[ $i ]['end'] <= $right[ $j ]['start'] ) $i++; else $j++;
		}
		return false;
	}

	private function resolve_subject( \WP_REST_Request $request, $required ) {
		if ( is_user_logged_in() ) {
			$user_id = get_current_user_id();
			return array(
				'key'        => hash( 'sha256', 'user:' . $user_id ),
				'user_id'    => $user_id,
				'expires_at' => null,
			);
		}

		$authorization = (string) $request->get_header( 'authorization' );
		if ( ! preg_match( '/^Bearer\s+(.+)$/i', $authorization, $match ) ) {
			return $required ? new \WP_Error( 'authentication_required', __( 'A signed reader session is required.', 'relikes' ), array( 'status' => 401 ) ) : null;
		}
		if ( empty( Plugin::instance()->settings()['allow_anonymous'] ) ) {
			return new \WP_Error( 'anonymous_disabled', __( 'Anonymous reactions are disabled.', 'relikes' ), array( 'status' => 403 ) );
		}

		$payload = $this->verify_token( trim( $match[1] ) );
		if ( is_wp_error( $payload ) ) return $payload;
		return array(
			'key'        => hash( 'sha256', 'anon:' . $payload['sid'] ),
			'user_id'    => null,
			'expires_at' => gmdate( 'Y-m-d H:i:s', (int) $payload['exp'] ),
		);
	}

	private function sign_token( array $payload ) {
		$encoded   = $this->base64url_encode( wp_json_encode( $payload ) );
		$signature = hash_hmac( 'sha256', $encoded, wp_salt( 'auth' ), true );
		return $encoded . '.' . $this->base64url_encode( $signature );
	}

	private function verify_token( $token ) {
		$parts = explode( '.', $token, 2 );
		if ( 2 !== count( $parts ) ) return new \WP_Error( 'invalid_token', __( 'The reader session is invalid.', 'relikes' ), array( 'status' => 401 ) );
		$expected = $this->base64url_encode( hash_hmac( 'sha256', $parts[0], wp_salt( 'auth' ), true ) );
		if ( ! hash_equals( $expected, $parts[1] ) ) return new \WP_Error( 'invalid_token', __( 'The reader session is invalid.', 'relikes' ), array( 'status' => 401 ) );
		$payload = json_decode( $this->base64url_decode( $parts[0] ), true );
		if ( ! is_array( $payload ) || empty( $payload['sid'] ) || empty( $payload['exp'] ) || (int) $payload['exp'] <= time() ) {
			return new \WP_Error( 'expired_token', __( 'The reader session has expired.', 'relikes' ), array( 'status' => 401 ) );
		}
		return $payload;
	}

	private function base64url_encode( $value ) {
		return rtrim( strtr( base64_encode( $value ), '+/', '-_' ), '=' );
	}

	private function base64url_decode( $value ) {
		$padding = strlen( $value ) % 4;
		if ( $padding ) $value .= str_repeat( '=', 4 - $padding );
		return base64_decode( strtr( $value, '-_', '+/' ), true );
	}

	private function rate_limit( $scope, $identity, $limit, $window ) {
		$bucket = (int) floor( time() / $window );
		$key    = 'relikes_rate_' . md5( get_current_blog_id() . '|' . $scope . '|' . $identity . '|' . $bucket );
		$count  = (int) get_transient( $key );
		if ( $count >= $limit ) return false;
		set_transient( $key, $count + 1, $window + 60 );
		return true;
	}

	private function request_ip() {
		return sanitize_text_field( (string) ( $_SERVER['REMOTE_ADDR'] ?? 'unknown' ) );
	}

	private function from_error( \WP_Error $error ) {
		$data   = $error->get_error_data();
		$status = isset( $data['status'] ) ? (int) $data['status'] : 400;
		unset( $data['status'] );
		return $this->error( $status, $error->get_error_code(), $error->get_error_message(), $data );
	}

	private function error( $status, $code, $message, array $details = array() ) {
		return new \WP_REST_Response(
			array( 'error' => array( 'code' => $code, 'message' => $message, 'details' => $details ) ),
			$status
		);
	}
}
