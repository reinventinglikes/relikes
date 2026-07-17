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

	public function heatmap( $document_key, $document_version, $excluded_subject_key = '', $max_steps = 100 ) {
		$document  = $this->get_document( $document_key, $document_version );
		$max_steps = min( 1000, max( 1, absint( $max_steps ) ) );
		if ( ! $document ) {
			$heatmap             = $this->empty_heatmap();
			$heatmap['maxSteps'] = $max_steps;
			return $heatmap;
		}

		$heatmap = $this->cached_heatmap( $document_key, $document_version, $document );
		if ( $excluded_subject_key ) {
			$heatmap = $this->exclude_subject_from_heatmap( $heatmap, (int) $document->id, $excluded_subject_key );
		}

		unset( $heatmap['nextExpiry'] );
		$heatmap['maxSteps'] = $max_steps;
		return $heatmap;
	}

	private function empty_heatmap( $revision = '0' ) {
		return array(
			'schema'         => 1,
			'revision'       => (string) $revision,
			'maxHits'        => 0,
			'totalUsers'     => 0,
			'totalReactions' => 0,
			'segments'       => array(),
		);
	}

	private function cached_heatmap( $document_key, $document_version, $document ) {
		$heatmap = $this->empty_heatmap( $document->revision );

		for ( $attempt = 0; $attempt < 2; $attempt++ ) {
			$cached = $this->decode_cached_heatmap( $document );
			if ( empty( $document->heatmap_dirty ) && $cached ) {
				return $cached;
			}

			$heatmap = $this->build_heatmap( (int) $document->id, (int) $document->revision );
			$encoded = wp_json_encode( $heatmap );
			if ( false !== $encoded ) {
				$saved = $this->wpdb->update(
					$this->documents,
					array(
						'heatmap'       => $encoded,
						'heatmap_dirty' => 0,
					),
					array(
						'id'       => (int) $document->id,
						'revision' => (int) $document->revision,
					),
					array( '%s', '%d' ),
					array( '%d', '%d' )
				);
				if ( false !== $saved && $saved > 0 ) {
					return $heatmap;
				}
			}

			$document = $this->get_document( $document_key, $document_version );
			if ( ! $document ) {
				return $this->empty_heatmap();
			}
		}

		return $heatmap;
	}

	private function decode_cached_heatmap( $document ) {
		if ( empty( $document->heatmap ) ) {
			return null;
		}

		$heatmap = json_decode( (string) $document->heatmap, true );
		if ( ! is_array( $heatmap ) || 1 !== (int) ( $heatmap['schema'] ?? 0 ) || ! isset( $heatmap['segments'] ) || ! is_array( $heatmap['segments'] ) ) {
			return null;
		}
		if ( (string) ( $heatmap['revision'] ?? '' ) !== (string) $document->revision ) {
			return null;
		}
		if ( ! empty( $heatmap['nextExpiry'] ) && (string) $heatmap['nextExpiry'] <= current_time( 'mysql', true ) ) {
			return null;
		}

		return $heatmap;
	}

	private function build_heatmap( $document_id, $revision ) {
		$wpdb = $this->wpdb;
		// A dirty aggregate cache rebuild intentionally reads the current custom-table rows.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				'SELECT r.kind, r.start_offset, r.end_offset, r.subject_id, s.expires_at
				FROM %i AS r
				INNER JOIN %i AS s ON s.id = r.subject_id
				WHERE s.document_id = %d
					AND (s.expires_at IS NULL OR s.expires_at >= %s)
				ORDER BY r.start_offset ASC, r.end_offset ASC',
				$this->runs,
				$this->subjects,
				$document_id,
				current_time( 'mysql', true )
			)
		);
		$events          = array();
		$users           = array();
		$next_expiration = null;

		foreach ( $rows as $row ) {
			$channel = 'dislike' === $row->kind ? 'dislikes' : 'likes';
			$start   = (int) $row->start_offset;
			$end     = (int) $row->end_offset;
			$this->add_heatmap_event( $events, $start, $channel, 1 );
			$this->add_heatmap_event( $events, $end, $channel, -1 );
			$users[ (int) $row->subject_id ] = true;
			if ( $row->expires_at && ( null === $next_expiration || (string) $row->expires_at < $next_expiration ) ) {
				$next_expiration = (string) $row->expires_at;
			}
		}

		$heatmap                   = $this->heatmap_from_events( $events, $revision );
		$heatmap['totalUsers']     = count( $users );
		$heatmap['totalReactions'] = count( $rows );
		$heatmap['generatedAt']    = current_time( 'mysql', true );
		$heatmap['nextExpiry']     = $next_expiration;
		return $heatmap;
	}

	private function exclude_subject_from_heatmap( array $heatmap, $document_id, $subject_key ) {
		$subject = $this->get_subject( $document_id, $subject_key );
		if ( ! $subject || ( $subject->expires_at && (string) $subject->expires_at < current_time( 'mysql', true ) ) ) {
			$heatmap['excludesCurrentSubject'] = true;
			return $heatmap;
		}

		$wpdb = $this->wpdb;
		// Personalized heatmaps subtract only this subject's current custom-table rows.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				'SELECT kind, start_offset, end_offset FROM %i WHERE subject_id = %d',
				$this->runs,
				(int) $subject->id
			)
		);
		$events = array();

		foreach ( $heatmap['segments'] as $segment ) {
			$start    = (int) ( $segment['start'] ?? 0 );
			$end      = (int) ( $segment['end'] ?? 0 );
			$likes    = max( 0, (int) ( $segment['likes'] ?? 0 ) );
			$dislikes = max( 0, (int) ( $segment['dislikes'] ?? 0 ) );
			if ( $end <= $start ) continue;
			$this->add_heatmap_event( $events, $start, 'likes', $likes );
			$this->add_heatmap_event( $events, $end, 'likes', -$likes );
			$this->add_heatmap_event( $events, $start, 'dislikes', $dislikes );
			$this->add_heatmap_event( $events, $end, 'dislikes', -$dislikes );
		}

		foreach ( $rows as $row ) {
			$channel = 'dislike' === $row->kind ? 'dislikes' : 'likes';
			$start   = (int) $row->start_offset;
			$end     = (int) $row->end_offset;
			if ( $end <= $start ) continue;
			$this->add_heatmap_event( $events, $start, $channel, -1 );
			$this->add_heatmap_event( $events, $end, $channel, 1 );
		}

		$personalized                       = $this->heatmap_from_events( $events, $heatmap['revision'] ?? '0' );
		$heatmap['maxHits']                = $personalized['maxHits'];
		$heatmap['segments']               = $personalized['segments'];
		$heatmap['totalUsers']             = max( 0, (int) ( $heatmap['totalUsers'] ?? 0 ) - ( $rows ? 1 : 0 ) );
		$heatmap['totalReactions']         = max( 0, (int) ( $heatmap['totalReactions'] ?? 0 ) - count( $rows ) );
		$heatmap['excludesCurrentSubject'] = true;
		return $heatmap;
	}

	private function add_heatmap_event( array &$events, $position, $channel, $delta ) {
		$position = (int) $position;
		if ( ! isset( $events[ $position ] ) ) {
			$events[ $position ] = array( 'likes' => 0, 'dislikes' => 0 );
		}
		$events[ $position ][ $channel ] += (int) $delta;
	}

	private function heatmap_from_events( array $events, $revision ) {
		ksort( $events, SORT_NUMERIC );
		$segments = array();
		$counts   = array( 'likes' => 0, 'dislikes' => 0 );
		$previous = null;
		$max_hits = 0;

		foreach ( $events as $position => $delta ) {
			$position = (int) $position;
			if ( null !== $previous && $position > $previous ) {
				$likes    = max( 0, $counts['likes'] );
				$dislikes = max( 0, $counts['dislikes'] );
				if ( $likes || $dislikes ) {
					$this->append_heatmap_segment(
						$segments,
						array(
							'start'    => $previous,
							'end'      => $position,
							'likes'    => $likes,
							'dislikes' => $dislikes,
						)
					);
					$max_hits = max( $max_hits, $likes + $dislikes );
				}
			}
			$counts['likes']    += $delta['likes'];
			$counts['dislikes'] += $delta['dislikes'];
			$previous = $position;
		}

		return array(
			'schema'         => 1,
			'revision'       => (string) $revision,
			'maxHits'        => $max_hits,
			'totalUsers'     => 0,
			'totalReactions' => 0,
			'segments'       => $segments,
		);
	}

	private function append_heatmap_segment( array &$segments, array $segment ) {
		$last_index = count( $segments ) - 1;
		if ( $last_index >= 0 &&
			$segments[ $last_index ]['end'] === $segment['start'] &&
			$segments[ $last_index ]['likes'] === $segment['likes'] &&
			$segments[ $last_index ]['dislikes'] === $segment['dislikes'] ) {
			$segments[ $last_index ]['end'] = $segment['end'];
			return;
		}
		$segments[] = $segment;
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
		$wpdb = $this->wpdb;
		$hash = hash( 'sha256', $key . "\n" . $version );
		// This transaction-sensitive lookup must read the current custom-table state.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		return $wpdb->get_row(
			$wpdb->prepare( 'SELECT * FROM %i WHERE document_hash = %s', $this->documents, $hash )
		);
	}

	private function get_subject( $document_id, $subject_key ) {
		$wpdb = $this->wpdb;
		// This transaction-sensitive lookup must read the current custom-table state.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		return $wpdb->get_row(
			$wpdb->prepare(
				'SELECT * FROM %i WHERE document_id = %d AND subject_key = %s',
				$this->subjects,
				$document_id,
				$subject_key
			)
		);
	}

	public function purge_document_prefix( $prefix ) {
		$wpdb                 = $this->wpdb;
		$document_key_pattern = $wpdb->esc_like( $prefix ) . '%';

		// Re:Likes owns these tables; this direct write has no object-cache entry to invalidate.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->query(
			$wpdb->prepare(
				'DELETE r
				FROM %i AS r
				INNER JOIN %i AS s ON s.id = r.subject_id
				INNER JOIN %i AS d ON d.id = s.document_id
				WHERE d.document_key LIKE %s',
				$this->runs,
				$this->subjects,
				$this->documents,
				$document_key_pattern
			)
		);
		// Re:Likes owns these tables; this direct write has no object-cache entry to invalidate.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->query(
			$wpdb->prepare(
				'DELETE s
				FROM %i AS s
				INNER JOIN %i AS d ON d.id = s.document_id
				WHERE d.document_key LIKE %s',
				$this->subjects,
				$this->documents,
				$document_key_pattern
			)
		);
		// Re:Likes owns these tables; this direct write has no object-cache entry to invalidate.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->query(
			$wpdb->prepare(
				'DELETE FROM %i WHERE document_key LIKE %s',
				$this->documents,
				$document_key_pattern
			)
		);
	}

	public function purge_user( $user_id ) {
		$wpdb = $this->wpdb;
		// Removing a user's reactions invalidates each affected document aggregate.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->query(
			$wpdb->prepare(
				'UPDATE %i AS d
				INNER JOIN %i AS s ON s.document_id = d.id
				SET d.revision = d.revision + 1, d.heatmap_dirty = 1
				WHERE s.user_id = %d',
				$this->documents,
				$this->subjects,
				$user_id
			)
		);
		// Re:Likes owns these tables; this direct write has no object-cache entry to invalidate.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->query(
			$wpdb->prepare(
				'DELETE r
				FROM %i AS r
				INNER JOIN %i AS s ON s.id = r.subject_id
				WHERE s.user_id = %d',
				$this->runs,
				$this->subjects,
				$user_id
			)
		);
		// Re:Likes owns these tables; this direct write has no object-cache entry to invalidate.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->query(
			$wpdb->prepare(
				'DELETE FROM %i WHERE user_id = %d',
				$this->subjects,
				$user_id
			)
		);
	}

	public function cleanup_expired() {
		$wpdb = $this->wpdb;
		$now  = current_time( 'mysql', true );

		// Expiry changes aggregate counts, so mark each affected document for rebuilding.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->query(
			$wpdb->prepare(
				'UPDATE %i AS d
				INNER JOIN %i AS s ON s.document_id = d.id
				SET d.revision = d.revision + 1, d.heatmap_dirty = 1
				WHERE s.expires_at IS NOT NULL AND s.expires_at < %s',
				$this->documents,
				$this->subjects,
				$now
			)
		);
		// Re:Likes owns these tables; this direct write has no object-cache entry to invalidate.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->query(
			$wpdb->prepare(
				'DELETE r
				FROM %i AS r
				INNER JOIN %i AS s ON s.id = r.subject_id
				WHERE s.expires_at IS NOT NULL AND s.expires_at < %s',
				$this->runs,
				$this->subjects,
				$now
			)
		);
		// Re:Likes owns these tables; this direct write has no object-cache entry to invalidate.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->query(
			$wpdb->prepare(
				'DELETE FROM %i WHERE expires_at IS NOT NULL AND expires_at < %s',
				$this->subjects,
				$now
			)
		);
	}

	public function export_user( $user_id ) {
		$wpdb = $this->wpdb;
		// Privacy exports must include the current custom-table state.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		return $wpdb->get_results(
			$wpdb->prepare(
				'SELECT d.document_key, r.kind, r.start_offset, r.end_offset, s.updated_at
				FROM %i AS s
				INNER JOIN %i AS d ON d.id = s.document_id
				INNER JOIN %i AS r ON r.subject_id = s.id
				WHERE s.user_id = %d
				ORDER BY d.document_key, r.start_offset',
				$this->subjects,
				$this->documents,
				$this->runs,
				$user_id
			),
			ARRAY_A
		);
	}
}
