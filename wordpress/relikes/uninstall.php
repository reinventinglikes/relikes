<?php
/**
 * SPDX-FileCopyrightText: 2026 kotoverse
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

$settings = get_option( 'relikes_wp_settings', array() );
if ( empty( $settings['delete_data_on_uninstall'] ) ) {
	return;
}

global $wpdb;
$tables = array(
	$wpdb->prefix . 'relikes_runs',
	$wpdb->prefix . 'relikes_subjects',
	$wpdb->prefix . 'relikes_documents',
);

foreach ( $tables as $table ) {
	$wpdb->query( "DROP TABLE IF EXISTS {$table}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
}

delete_option( 'relikes_wp_settings' );
delete_option( 'relikes_db_version' );
wp_clear_scheduled_hook( 'relikes_cleanup_expired' );
