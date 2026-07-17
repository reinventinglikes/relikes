<?php
/**
 * Plugin Name: Re:Likes
 * Plugin URI: https://relikes.com/
 * Description: Persistent like and dislike reactions attached to exact passages of WordPress content.
 * Version: 1.1.0
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Author: kotoverse
 * Author URI: https://github.com/kotoverse
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: relikes
 *
 * Copyright (c) 2026 kotoverse
 * Source repository: https://github.com/reinventinglikes/relikes
 * Bundled browser cores: MIT; see LICENSES/MIT.txt.
 * SPDX-FileCopyrightText: 2026 kotoverse
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'RELIKES_WP_VERSION', '1.1.0' );
define( 'RELIKES_DB_VERSION', '1' );
if ( ! defined( 'CLEAN_SELECTION_CORE_VERSION' ) ) {
	define( 'CLEAN_SELECTION_CORE_VERSION', '1.1.0' );
}
define( 'RELIKES_WP_FILE', __FILE__ );
define( 'RELIKES_WP_DIR', plugin_dir_path( __FILE__ ) );
define( 'RELIKES_WP_URL', plugin_dir_url( __FILE__ ) );

require_once RELIKES_WP_DIR . 'includes/class-relikes-storage.php';
require_once RELIKES_WP_DIR . 'includes/class-relikes-rest-controller.php';
require_once RELIKES_WP_DIR . 'includes/class-relikes-plugin.php';

register_activation_hook( __FILE__, array( 'Relikes_WP\Storage', 'install' ) );
register_deactivation_hook( __FILE__, array( 'Relikes_WP\Plugin', 'deactivate' ) );

Relikes_WP\Plugin::instance()->run();
