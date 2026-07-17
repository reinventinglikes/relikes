<?php
/**
 * SPDX-FileCopyrightText: 2026 kotoverse
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

namespace Relikes_WP;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Storage {
	private $wpdb;
	private $documents;
	private $subjects;
	private $runs;

	public function __construct() {
		global $wpdb;
		$this->wpdb      = $wpdb;
		$this->documents = $wpdb->prefix . 'relikes_documents';
		$this->subjects  = $wpdb->prefix . 'relikes_subjects';
		$this->runs      = $wpdb->prefix . 'relikes_runs';
	}

	public static function install() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset_collate = $wpdb->get_charset_collate();
		$documents       = $wpdb->prefix . 'relikes_documents';
		$subjects        = $wpdb->prefix . 'relikes_subjects';
		$runs            = $wpdb->prefix . 'relikes_runs';

		dbDelta(
			"CREATE TABLE {$documents} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				document_hash char(64) NOT NULL,
				document_key varchar(191) NOT NULL,
				document_version varchar(64) NOT NULL,
				content_length bigint(20) unsigned NOT NULL DEFAULT 0,
				revision bigint(20) unsigned NOT NULL DEFAULT 0,
				heatmap longtext NULL,
				heatmap_dirty tinyint(1) NOT NULL DEFAULT 1,
				updated_at datetime NOT NULL,
				PRIMARY KEY  (id),
				UNIQUE KEY document_hash (document_hash),
				KEY document_key (document_key)
			) {$charset_collate};"
		);

		dbDelta(
			"CREATE TABLE {$subjects} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				document_id bigint(20) unsigned NOT NULL,
				subject_key char(64) NOT NULL,
				user_id bigint(20) unsigned NULL,
				client_revision bigint(20) unsigned NOT NULL DEFAULT 0,
				mutation_id varchar(64) NOT NULL DEFAULT '',
				expires_at datetime NULL,
				updated_at datetime NOT NULL,
				PRIMARY KEY  (id),
				UNIQUE KEY document_subject (document_id,subject_key),
				KEY user_id (user_id),
				KEY expires_at (expires_at)
			) {$charset_collate};"
		);

		dbDelta(
			"CREATE TABLE {$runs} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				subject_id bigint(20) unsigned NOT NULL,
				kind varchar(8) NOT NULL,
				start_offset int(10) unsigned NOT NULL,
				end_offset int(10) unsigned NOT NULL,
				PRIMARY KEY  (id),
				KEY subject_kind (subject_id,kind),
				KEY subject_offsets (subject_id,start_offset,end_offset)
			) {$charset_collate};"
		);

		update_option( 'relikes_db_version', RELIKES_DB_VERSION, false );
		if ( ! wp_next_scheduled( 'relikes_cleanup_expired' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'relikes_cleanup_expired' );
		}
	}

	public function ensure_schema() {
		if ( get_option( 'relikes_db_version' ) !== RELIKES_DB_VERSION ) {
			self::install();
		}
	}

	public function replace_snapshot( array $snapshot, array $subject ) {
		$now      = current_time( 'mysql', true );
		$document = $this->get_or_create_document(
			$snapshot['documentId'],
			$snapshot['documentVersion'],
			$snapshot['contentLength']
		);
		if ( ! $document ) {
			return new \WP_Error( 'storage_failure', __( 'Re:Likes could not initialize this document.', 'relikes' ), array( 'status' => 500 ) );
		}

		$this->wpdb->query( 'START TRANSACTION' );

		try {
			$stored_subject = $this->get_subject( (int) $document->id, $subject['key'] );

			if ( $stored_subject && hash_equals( (string) $stored_subject->mutation_id, $snapshot['mutationId'] ) ) {
				$this->wpdb->query( 'COMMIT' );
				return array(
					'serverRevision' => (int) $document->revision,
					'clientRevision' => (int) $stored_subject->client_revision,
					'idempotent'      => true,
				);
			}

			if ( $stored_subject && $snapshot['clientRevision'] <= (int) $stored_subject->client_revision ) {
				$this->wpdb->query( 'ROLLBACK' );
				return new \WP_Error(
					'stale_client_revision',
					__( 'The client revision is older than the stored snapshot.', 'relikes' ),
					array( 'status' => 409, 'storedClientRevision' => (int) $stored_subject->client_revision )
				);
			}

			$subject_data = array(
				'document_id'    => (int) $document->id,
				'subject_key'    => $subject['key'],
				'user_id'         => $subject['user_id'],
				'client_revision' => $snapshot['clientRevision'],
				'mutation_id'     => $snapshot['mutationId'],
				'expires_at'      => $subject['expires_at'],
				'updated_at'      => $now,
			);

			if ( $stored_subject ) {
				if ( false === $this->wpdb->update( $this->subjects, $subject_data, array( 'id' => (int) $stored_subject->id ) ) ) {
					throw new \RuntimeException( 'Could not update the Re:Likes subject.' );
				}
				$subject_id = (int) $stored_subject->id;
			} else {
				if ( false === $this->wpdb->insert( $this->subjects, $subject_data ) ) {
					throw new \RuntimeException( 'Could not insert the Re:Likes subject.' );
				}
				$subject_id = (int) $this->wpdb->insert_id;
			}

			if ( ! $subject_id ) {
				throw new \RuntimeException( 'Could not store the Re:Likes subject.' );
			}

			if ( false === $this->wpdb->delete( $this->runs, array( 'subject_id' => $subject_id ) ) ) {
				throw new \RuntimeException( 'Could not replace Re:Likes ranges.' );
			}
			foreach ( $snapshot['reactions'] as $reaction ) {
				foreach ( $reaction['runs'] as $run ) {
					$inserted = $this->wpdb->insert(
						$this->runs,
						array(
							'subject_id'   => $subject_id,
							'kind'         => $reaction['kind'],
							'start_offset' => $run['start'],
							'end_offset'   => $run['end'],
						),
						array( '%d', '%s', '%d', '%d' )
					);
					if ( false === $inserted ) {
						throw new \RuntimeException( 'Could not insert a Re:Likes range.' );
					}
				}
			}

			$server_revision = (int) $document->revision + 1;
			$updated = $this->wpdb->update(
				$this->documents,
				array(
					'content_length' => max( (int) $document->content_length, $snapshot['contentLength'] ),
					'revision'       => $server_revision,
					'heatmap_dirty'  => 1,
					'updated_at'     => $now,
				),
				array( 'id' => (int) $document->id )
			);
			if ( false === $updated ) {
				throw new \RuntimeException( 'Could not update the Re:Likes document.' );
			}
			$this->wpdb->query( 'COMMIT' );

			return array(
				'serverRevision' => $server_revision,
				'clientRevision' => $snapshot['clientRevision'],
				'idempotent'      => false,
			);
		} catch ( \Throwable $error ) {
			$this->wpdb->query( 'ROLLBACK' );
			return new \WP_Error( 'storage_failure', __( 'Re:Likes could not save this reaction.', 'relikes' ), array( 'status' => 500 ) );
		}
	}

	public function heatmap( $document_key, $document_version, $excluded_subject_key = '' ) {
		$document = $this->get_document( $document_key, $document_version );
		if ( ! $document ) {
			return array(
				'schema'         => 1,
				'revision'       => '0',
				'maxHits'        => 0,
				'totalUsers'     => 0,
				'totalReactions' => 0,
				'segments'       => array(),
			);
		}

		$where = 's.document_id = %d AND (s.expires_at IS NULL OR s.expires_at >= %s)';
		$args  = array( (int) $document->id, current_time( 'mysql', true ) );
		if ( $excluded_subject_key ) {
			$where .= ' AND s.subject_key <> %s';
			$args[] = $excluded_subject_key;
		}

		$query = "SELECT r.kind, r.start_offset, r.end_offset, r.subject_id
			FROM {$this->runs} r
			INNER JOIN {$this->subjects} s ON s.id = r.subject_id
			WHERE {$where}
			ORDER BY r.start_offset ASC, r.end_offset ASC";
		$rows  = $this->wpdb->get_results( $this->wpdb->prepare( $query, $args ) );
		$events = array();
		$users  = array();

		foreach ( $rows as $row ) {
			$kind = 'dislike' === $row->kind ? 'dislikes' : 'likes';
			$start = (int) $row->start_offset;
			$end   = (int) $row->end_offset;
			$events[ $start ] = isset( $events[ $start ] ) ? $events[ $start ] : array( 'likes' => 0, 'dislikes' => 0 );
			$events[ $end ]   = isset( $events[ $end ] ) ? $events[ $end ] : array( 'likes' => 0, 'dislikes' => 0 );
			$events[ $start ][ $kind ]++;
			$events[ $end ][ $kind ]--;
			$users[ (int) $row->subject_id ] = true;
		}

		ksort( $events, SORT_NUMERIC );
		$segments = array();
		$counts   = array( 'likes' => 0, 'dislikes' => 0 );
		$previous = null;
		$max_hits = 0;

		foreach ( $events as $position => $delta ) {
			$position = (int) $position;
			if ( null !== $previous && $position > $previous && ( $counts['likes'] || $counts['dislikes'] ) ) {
				$segments[] = array(
					'start'    => $previous,
					'end'      => $position,
					'likes'    => $counts['likes'],
					'dislikes' => $counts['dislikes'],
				);
				$max_hits = max( $max_hits, $counts['likes'] + $counts['dislikes'] );
			}
			$counts['likes']    += $delta['likes'];
			$counts['dislikes'] += $delta['dislikes'];
			$previous = $position;
		}

		return array(
			'schema'         => 1,
			'revision'       => (string) $document->revision,
			'maxHits'        => $max_hits,
			'totalUsers'     => count( $users ),
			'totalReactions' => count( $rows ),
			'segments'       => $segments,
		);
	}

	private function get_or_create_document( $key, $version, $content_length ) {
		$document = $this->get_document( $key, $version );
		if ( $document ) {
			return $document;
		}

		$hash = hash( 'sha256', $key . "\n" . $version );
		$this->wpdb->insert(
			$this->documents,
			array(
				'document_hash'    => $hash,
				'document_key'     => $key,
				'document_version' => $version,
				'content_length'   => max( 0, (int) $content_length ),
				'updated_at'       => current_time( 'mysql', true ),
			)
		);

		return $this->get_document( $key, $version );
	}

	private function get_document( $key, $version ) {
		$hash = hash( 'sha256', $key . "\n" . $version );
		return $this->wpdb->get_row(
			$this->wpdb->prepare( "SELECT * FROM {$this->documents} WHERE document_hash = %s", $hash )
		);
	}

	private function get_subject( $document_id, $subject_key ) {
		return $this->wpdb->get_row(
			$this->wpdb->prepare(
				"SELECT * FROM {$this->subjects} WHERE document_id = %d AND subject_key = %s",
				$document_id,
				$subject_key
			)
		);
	}

	public function purge_document_prefix( $prefix ) {
		$document_ids = $this->wpdb->get_col(
			$this->wpdb->prepare( "SELECT id FROM {$this->documents} WHERE document_key LIKE %s", $this->wpdb->esc_like( $prefix ) . '%' )
		);
		$this->delete_documents( array_map( 'intval', $document_ids ) );
	}

	public function purge_user( $user_id ) {
		$subject_ids = $this->wpdb->get_col(
			$this->wpdb->prepare( "SELECT id FROM {$this->subjects} WHERE user_id = %d", $user_id )
		);
		$this->delete_subjects( array_map( 'intval', $subject_ids ) );
	}

	public function cleanup_expired() {
		$subject_ids = $this->wpdb->get_col(
			$this->wpdb->prepare( "SELECT id FROM {$this->subjects} WHERE expires_at IS NOT NULL AND expires_at < %s", current_time( 'mysql', true ) )
		);
		$this->delete_subjects( array_map( 'intval', $subject_ids ) );
	}

	public function export_user( $user_id ) {
		$query = "SELECT d.document_key, r.kind, r.start_offset, r.end_offset, s.updated_at
			FROM {$this->subjects} s
			INNER JOIN {$this->documents} d ON d.id = s.document_id
			INNER JOIN {$this->runs} r ON r.subject_id = s.id
			WHERE s.user_id = %d
			ORDER BY d.document_key, r.start_offset";
		return $this->wpdb->get_results( $this->wpdb->prepare( $query, $user_id ), ARRAY_A );
	}

	private function delete_subjects( array $subject_ids ) {
		if ( ! $subject_ids ) return;
		$placeholders = implode( ',', array_fill( 0, count( $subject_ids ), '%d' ) );
		$this->wpdb->query( $this->wpdb->prepare( "DELETE FROM {$this->runs} WHERE subject_id IN ({$placeholders})", $subject_ids ) );
		$this->wpdb->query( $this->wpdb->prepare( "DELETE FROM {$this->subjects} WHERE id IN ({$placeholders})", $subject_ids ) );
	}

	private function delete_documents( array $document_ids ) {
		if ( ! $document_ids ) return;
		$placeholders = implode( ',', array_fill( 0, count( $document_ids ), '%d' ) );
		$subject_ids = $this->wpdb->get_col( $this->wpdb->prepare( "SELECT id FROM {$this->subjects} WHERE document_id IN ({$placeholders})", $document_ids ) );
		$this->delete_subjects( array_map( 'intval', $subject_ids ) );
		$this->wpdb->query( $this->wpdb->prepare( "DELETE FROM {$this->documents} WHERE id IN ({$placeholders})", $document_ids ) );
	}
}
