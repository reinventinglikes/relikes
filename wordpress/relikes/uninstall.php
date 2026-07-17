<?php
/**
 * SPDX-FileCopyrightText: 2026 kotoverse
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

$relikes_settings = get_option( 'relikes_wp_settings', array() );
if ( empty( $relikes_settings['delete_data_on_uninstall'] ) ) {
	return;
}

global $wpdb;
$relikes_tables = array(
	$wpdb->prefix . 'relikes_runs',
	$wpdb->prefix . 'relikes_subjects',
	$wpdb->prefix . 'relikes_documents',
);

foreach ( $relikes_tables as $relikes_table ) {
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Uninstall explicitly removes the plugin's custom tables.
	$wpdb->query( $wpdb->prepare( 'DROP TABLE IF EXISTS %i', $relikes_table ) );
}

delete_option( 'relikes_wp_settings' );
delete_option( 'relikes_db_version' );
wp_clear_scheduled_hook( 'relikes_cleanup_expired' );
