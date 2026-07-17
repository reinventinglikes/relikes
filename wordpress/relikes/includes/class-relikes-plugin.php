<?php
/**
 * Re:Likes WordPress integration.
 *
 * SPDX-FileCopyrightText: 2026 kotoverse
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

namespace Relikes_WP;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Plugin {
	const OPTION           = 'relikes_wp_settings';
	const SETTINGS_VERSION = 3;

	private static $instance;
	private $storage;

	public static function instance() {
		if ( ! self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		$this->storage = new Storage();
	}

	public function run() {
		add_action( 'plugins_loaded', array( $this->storage, 'ensure_schema' ) );
		add_action( 'rest_api_init', array( new Rest_Controller( $this->storage ), 'register_routes' ) );
		add_action( 'admin_init', array( $this, 'maybe_upgrade_settings' ), 5 );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_menu', array( $this, 'add_settings_page' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend' ) );
		add_action( 'relikes_cleanup_expired', array( $this->storage, 'cleanup_expired' ) );
		add_action( 'save_post', array( $this, 'purge_post' ) );
		add_action( 'deleted_post', array( $this, 'purge_post' ) );
		add_action( 'edit_comment', array( $this, 'purge_comment' ) );
		add_action( 'deleted_comment', array( $this, 'purge_comment' ) );
		add_action( 'transition_comment_status', array( $this, 'purge_comment_transition' ), 10, 3 );
		add_action( 'deleted_user', array( $this->storage, 'purge_user' ) );
		add_filter( 'wp_privacy_personal_data_exporters', array( $this, 'register_exporter' ) );
		add_filter( 'wp_privacy_personal_data_erasers', array( $this, 'register_eraser' ) );
	}

	public static function deactivate() {
		wp_clear_scheduled_hook( 'relikes_cleanup_expired' );
	}

	public static function defaults() {
		return array(
			'settings_version'          => self::SETTINGS_VERSION,
			'post_types'                => array( 'post', 'page' ),
			'additional_post_types'     => '',
			'enable_content'            => true,
			'enable_comments'           => false,
			'content_selector'          => '.entry-content, .wp-block-post-content',
			'comment_selector'          => '.comment-content, .wp-block-comment-content',
			'instance_keys'             => 'content',
			'show_heatmap'              => true,
			'allow_anonymous'           => true,
			'anonymous_retention_days'  => 120,
			'selection_color'           => '#5aa8ff',
			'like_color'                => '#55b96f',
			'dislike_color'             => '#df8389',
			'reaction_alpha'            => 0.32,
			'brush_hardness'            => 0.34,
			'brush_max_alpha'           => 0.16,
			'brush_spacing'             => 0.33,
			'brush_turbulence'          => 0.22,
			'brush_turbulence_speed'    => 0.54,
			'brush_final_alpha'         => 0.28,
			'brush_fade_speed'          => 0.035,
			'brush_grow_speed'          => 0.04,
			'brush_padding_ratio'       => 0.3,
			'cloud_padding_ratio'       => 0.32,
			'cursor'                    => '',
			'center_popup'              => false,
			'content_radius'            => 18,
			'content_overlay_padding'   => 72,
			'content_virtual_padding'   => 20,
			'content_detect_tolerance'  => 3,
			'comment_radius'            => 18,
			'comment_overlay_padding'   => 72,
			'comment_virtual_padding'   => 20,
			'comment_detect_tolerance'  => 3,
			'heatmap_scale'             => 'linear',
			'heatmap_min_alpha'         => 0,
			'heatmap_max_alpha'         => 0.48,
			'control_appearance'        => 'default',
			'control_accent_color'      => '#294765',
			'control_background_color'  => '#dce8f2',
			'control_border_color'      => '#ccd9e6',
			'control_text_color'        => '#607489',
			'control_active_text_color' => '#ffffff',
			'control_clear_color'       => '#607489',
			'control_radius'            => 999,
			'touch_bar'                 => true,
			'touch_bar_placement'       => 'top',
			'touch_bar_offset'          => '0px',
			'delete_data_on_uninstall'  => false,
		);
	}

	private function normalize_legacy_settings( $settings ) {
		$settings = is_array( $settings ) ? $settings : array();
		$version  = isset( $settings['settings_version'] ) ? absint( $settings['settings_version'] ) : 1;

		if ( $version < 2 ) {
			if ( isset( $settings['comment_selector'] ) && '.comment-content' === trim( $settings['comment_selector'] ) ) {
				$settings['comment_selector'] = '.comment-content, .wp-block-comment-content';
			}
			if ( isset( $settings['post_types'] ) && is_array( $settings['post_types'] ) ) {
				$settings['post_types'] = array_values( array_diff( $settings['post_types'], array( 'attachment' ) ) );
			}
			$settings['settings_version'] = self::SETTINGS_VERSION;
		}

		if ( $version < 3 ) {
			$settings['center_popup']     = ! empty( $settings['center_popup'] );
			$settings['settings_version'] = self::SETTINGS_VERSION;
		}

		return $settings;
	}

	public function maybe_upgrade_settings() {
		$stored     = get_option( self::OPTION, array() );
		$normalized = $this->normalize_legacy_settings( $stored );
		if ( $normalized !== $stored ) {
			update_option( self::OPTION, $normalized );
		}
	}

	public function settings() {
		return wp_parse_args( $this->normalize_legacy_settings( get_option( self::OPTION, array() ) ), self::defaults() );
	}

	public function register_settings() {
		register_setting(
			'relikes_wp',
			self::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => self::defaults(),
			)
		);
	}

	private function clamp_number( $value, $default, $minimum, $maximum ) {
		$number = is_numeric( $value ) ? (float) $value : (float) $default;
		return min( $maximum, max( $minimum, $number ) );
	}

	private function sanitize_cursor( $value ) {
		$value = sanitize_key( (string) $value );
		return in_array( $value, array( 'crosshair', 'default', 'text' ), true ) ? $value : '';
	}

	public function sanitize_settings( $input ) {
		$defaults = self::defaults();
		$input    = is_array( $input ) ? $input : array();
		$types    = isset( $input['post_types'] ) && is_array( $input['post_types'] ) ? array_map( 'sanitize_key', $input['post_types'] ) : array();
		$types    = array_values( array_diff( array_unique( array_filter( $types ) ), array( 'attachment' ) ) );
		$heat_min = $this->clamp_number( $input['heatmap_min_alpha'] ?? null, $defaults['heatmap_min_alpha'], 0, 0.4 );
		$heat_max = $this->clamp_number( $input['heatmap_max_alpha'] ?? null, $defaults['heatmap_max_alpha'], 0.1, 0.75 );

		return array(
			'settings_version'          => self::SETTINGS_VERSION,
			'post_types'                => $types,
			'additional_post_types'     => $this->sanitize_post_type_list( $input['additional_post_types'] ?? '' ),
			'enable_content'            => ! empty( $input['enable_content'] ),
			'enable_comments'           => ! empty( $input['enable_comments'] ),
			'content_selector'          => sanitize_text_field( $input['content_selector'] ?? $defaults['content_selector'] ),
			'comment_selector'          => sanitize_text_field( $input['comment_selector'] ?? $defaults['comment_selector'] ),
			'instance_keys'             => $this->sanitize_instance_keys( $input['instance_keys'] ?? $defaults['instance_keys'] ),
			'show_heatmap'              => ! empty( $input['show_heatmap'] ),
			'allow_anonymous'           => ! empty( $input['allow_anonymous'] ),
			'anonymous_retention_days'  => min( 730, max( 1, absint( $input['anonymous_retention_days'] ?? $defaults['anonymous_retention_days'] ) ) ),
			'selection_color'           => sanitize_hex_color( $input['selection_color'] ?? '' ) ?: $defaults['selection_color'],
			'like_color'                => sanitize_hex_color( $input['like_color'] ?? '' ) ?: $defaults['like_color'],
			'dislike_color'             => sanitize_hex_color( $input['dislike_color'] ?? '' ) ?: $defaults['dislike_color'],
			'reaction_alpha'            => $this->clamp_number( $input['reaction_alpha'] ?? null, $defaults['reaction_alpha'], 0.05, 0.8 ),
			'brush_hardness'            => $this->clamp_number( $input['brush_hardness'] ?? null, $defaults['brush_hardness'], 0.05, 0.85 ),
			'brush_max_alpha'           => $this->clamp_number( $input['brush_max_alpha'] ?? null, $defaults['brush_max_alpha'], 0.05, 0.4 ),
			'brush_spacing'             => $this->clamp_number( $input['brush_spacing'] ?? null, $defaults['brush_spacing'], 0.15, 0.75 ),
			'brush_turbulence'          => $this->clamp_number( $input['brush_turbulence'] ?? null, $defaults['brush_turbulence'], 0, 0.6 ),
			'brush_turbulence_speed'    => $this->clamp_number( $input['brush_turbulence_speed'] ?? null, $defaults['brush_turbulence_speed'], 0.1, 1.2 ),
			'brush_final_alpha'         => $this->clamp_number( $input['brush_final_alpha'] ?? null, $defaults['brush_final_alpha'], 0.1, 0.6 ),
			'brush_fade_speed'          => $this->clamp_number( $input['brush_fade_speed'] ?? null, $defaults['brush_fade_speed'], 0.01, 0.08 ),
			'brush_grow_speed'          => $this->clamp_number( $input['brush_grow_speed'] ?? null, $defaults['brush_grow_speed'], 0.01, 0.08 ),
			'brush_padding_ratio'       => $this->clamp_number( $input['brush_padding_ratio'] ?? null, $defaults['brush_padding_ratio'], 0.1, 0.6 ),
			'cloud_padding_ratio'       => $this->clamp_number( $input['cloud_padding_ratio'] ?? null, $defaults['cloud_padding_ratio'], 0.1, 0.6 ),
			'cursor'                    => $this->sanitize_cursor( $input['cursor'] ?? '' ),
			'center_popup'              => ! empty( $input['center_popup'] ),
			'content_radius'            => $this->clamp_number( $input['content_radius'] ?? null, $defaults['content_radius'], 12, 42 ),
			'content_overlay_padding'   => $this->clamp_number( $input['content_overlay_padding'] ?? null, $defaults['content_overlay_padding'], 24, 128 ),
			'content_virtual_padding'   => $this->clamp_number( $input['content_virtual_padding'] ?? null, $defaults['content_virtual_padding'], 0, 48 ),
			'content_detect_tolerance'  => $this->clamp_number( $input['content_detect_tolerance'] ?? null, $defaults['content_detect_tolerance'], 0, 18 ),
			'comment_radius'            => $this->clamp_number( $input['comment_radius'] ?? null, $defaults['comment_radius'], 12, 42 ),
			'comment_overlay_padding'   => $this->clamp_number( $input['comment_overlay_padding'] ?? null, $defaults['comment_overlay_padding'], 24, 128 ),
			'comment_virtual_padding'   => $this->clamp_number( $input['comment_virtual_padding'] ?? null, $defaults['comment_virtual_padding'], 0, 48 ),
			'comment_detect_tolerance'  => $this->clamp_number( $input['comment_detect_tolerance'] ?? null, $defaults['comment_detect_tolerance'], 0, 18 ),
			'heatmap_scale'             => in_array( $input['heatmap_scale'] ?? '', array( 'linear', 'sqrt', 'log' ), true ) ? $input['heatmap_scale'] : $defaults['heatmap_scale'],
			'heatmap_min_alpha'         => min( $heat_min, $heat_max ),
			'heatmap_max_alpha'         => max( $heat_min, $heat_max ),
			'control_appearance'        => 'theme' === ( $input['control_appearance'] ?? '' ) ? 'theme' : 'default',
			'control_accent_color'      => sanitize_hex_color( $input['control_accent_color'] ?? '' ) ?: $defaults['control_accent_color'],
			'control_background_color'  => sanitize_hex_color( $input['control_background_color'] ?? '' ) ?: $defaults['control_background_color'],
			'control_border_color'      => sanitize_hex_color( $input['control_border_color'] ?? '' ) ?: $defaults['control_border_color'],
			'control_text_color'        => sanitize_hex_color( $input['control_text_color'] ?? '' ) ?: $defaults['control_text_color'],
			'control_active_text_color' => sanitize_hex_color( $input['control_active_text_color'] ?? '' ) ?: $defaults['control_active_text_color'],
			'control_clear_color'       => sanitize_hex_color( $input['control_clear_color'] ?? '' ) ?: $defaults['control_clear_color'],
			'control_radius'            => min( 999, absint( $input['control_radius'] ?? $defaults['control_radius'] ) ),
			'touch_bar'                 => ! empty( $input['touch_bar'] ),
			'touch_bar_placement'       => in_array( $input['touch_bar_placement'] ?? '', array( 'top', 'bottom', 'floating' ), true ) ? $input['touch_bar_placement'] : $defaults['touch_bar_placement'],
			'touch_bar_offset'          => sanitize_text_field( $input['touch_bar_offset'] ?? $defaults['touch_bar_offset'] ),
			'delete_data_on_uninstall'  => ! empty( $input['delete_data_on_uninstall'] ),
		);
	}

	private function sanitize_post_type_list( $value ) {
		$items = preg_split( '/[\s,]+/', (string) $value, -1, PREG_SPLIT_NO_EMPTY );
		$items = array_values( array_diff( array_unique( array_filter( array_map( 'sanitize_key', $items ) ) ), array( 'attachment' ) ) );
		return implode( ', ', $items );
	}

	private function sanitize_instance_keys( $value ) {
		$items = preg_split( '/[\s,]+/', (string) $value, -1, PREG_SPLIT_NO_EMPTY );
		$items = array_map(
			function ( $item ) {
				return substr( sanitize_key( $item ), 0, 64 );
			},
			$items
		);
		$items = array_values( array_unique( array_filter( $items ) ) );
		return implode( ', ', $items ?: array( 'content' ) );
	}

	public function add_settings_page() {
		add_options_page( __( 'Re:Likes', 'relikes' ), __( 'Re:Likes', 'relikes' ), 'manage_options', 'relikes', array( $this, 'render_settings_page' ) );
	}

	public function enqueue_admin_assets( $hook_suffix ) {
		if ( 'settings_page_relikes' !== $hook_suffix ) {
			return;
		}
		wp_enqueue_style( 'relikes-admin', RELIKES_WP_URL . 'assets/css/admin.css', array(), RELIKES_WP_VERSION );
	}

	private function render_number_field( $settings, $key, $label, $minimum, $maximum, $step, $suffix = '', $description = '' ) {
		?>
		<label class="rlkwp-field"><span class="rlkwp-field__label"><?php echo esc_html( $label ); ?></span><span class="rlkwp-input-with-unit"><input type="number" min="<?php echo esc_attr( $minimum ); ?>" max="<?php echo esc_attr( $maximum ); ?>" step="<?php echo esc_attr( $step ); ?>" name="<?php echo esc_attr( self::OPTION ); ?>[<?php echo esc_attr( $key ); ?>]" value="<?php echo esc_attr( $settings[ $key ] ); ?>"><?php if ( $suffix ) : ?><span><?php echo esc_html( $suffix ); ?></span><?php endif; ?></span><?php if ( $description ) : ?><small><?php echo esc_html( $description ); ?></small><?php endif; ?></label>
		<?php
	}

	private function render_color_field( $settings, $key, $label, $description = '' ) {
		?>
		<label class="rlkwp-field rlkwp-field--color"><span class="rlkwp-field__label"><?php echo esc_html( $label ); ?></span><span class="rlkwp-color-input"><input type="color" name="<?php echo esc_attr( self::OPTION ); ?>[<?php echo esc_attr( $key ); ?>]" value="<?php echo esc_attr( $settings[ $key ] ); ?>"><code><?php echo esc_html( strtoupper( $settings[ $key ] ) ); ?></code></span><?php if ( $description ) : ?><small><?php echo esc_html( $description ); ?></small><?php endif; ?></label>
		<?php
	}

	private function render_geometry_card( $settings, $prefix, $title, $description ) {
		?>
		<div class="rlkwp-subcard"><h3><?php echo esc_html( $title ); ?></h3><p><?php echo esc_html( $description ); ?></p><div class="rlkwp-field-grid rlkwp-field-grid--compact">
			<?php $this->render_number_field( $settings, $prefix . '_radius', __( 'Cloud radius', 'relikes' ), 12, 42, 1, 'px', __( 'Shared selection and reaction footprint.', 'relikes' ) ); ?>
			<?php $this->render_number_field( $settings, $prefix . '_overlay_padding', __( 'Overlay padding', 'relikes' ), 24, 128, 1, 'px', __( 'Outer render buffer for persistent clouds.', 'relikes' ) ); ?>
			<?php $this->render_number_field( $settings, $prefix . '_virtual_padding', __( 'Virtual padding', 'relikes' ), 0, 48, 1, 'px', __( 'Gesture reach outside the content box.', 'relikes' ) ); ?>
			<?php $this->render_number_field( $settings, $prefix . '_detect_tolerance', __( 'Detect tolerance', 'relikes' ), 0, 18, 1, 'px', __( 'Extra reach around rendered text.', 'relikes' ) ); ?>
		</div></div>
		<?php
	}

	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$settings   = $this->settings();
		$post_types = get_post_types( array( 'public' => true, 'show_ui' => true ), 'objects', 'and' );
		unset( $post_types['attachment'] );
		?>
		<div class="wrap rlkwp-settings">
			<header class="rlkwp-hero"><div><span class="rlkwp-kicker"><?php esc_html_e( 'Passage-level reactions', 'relikes' ); ?></span><h1><?php esc_html_e( 'Re:Likes', 'relikes' ); ?></h1><p><?php esc_html_e( 'Shape the selection brush, persistent reaction clouds, aggregate heatmap, and reader controls.', 'relikes' ); ?></p></div><div class="rlkwp-hero__clouds" style="--rlkwp-like:<?php echo esc_attr( $settings['like_color'] ); ?>;--rlkwp-dislike:<?php echo esc_attr( $settings['dislike_color'] ); ?>"><span></span><span></span></div></header>
			<form method="post" action="options.php">
				<?php settings_fields( 'relikes_wp' ); ?>
				<div class="rlkwp-layout">
					<section class="rlkwp-card"><div class="rlkwp-card__heading"><span>1</span><div><h2><?php esc_html_e( 'Placement', 'relikes' ); ?></h2><p><?php esc_html_e( 'Choose where reactions can be created. When both plugins target this page, Re:Likes takes priority over standalone Clean Selection.', 'relikes' ); ?></p></div></div><div class="rlkwp-check-grid">
						<?php foreach ( $post_types as $post_type ) : ?><label><input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[post_types][]" value="<?php echo esc_attr( $post_type->name ); ?>" <?php checked( in_array( $post_type->name, $settings['post_types'], true ) ); ?>><span><?php echo esc_html( $post_type->labels->name ); ?><code><?php echo esc_html( $post_type->name ); ?></code></span></label><?php endforeach; ?>
					</div><label class="rlkwp-field rlkwp-field--wide"><span class="rlkwp-field__label"><?php esc_html_e( 'Additional post-type slugs', 'relikes' ); ?></span><input type="text" name="<?php echo esc_attr( self::OPTION ); ?>[additional_post_types]" value="<?php echo esc_attr( $settings['additional_post_types'] ); ?>" placeholder="book, lesson"><small><?php esc_html_e( 'Comma-separated. Media attachments are intentionally excluded.', 'relikes' ); ?></small></label><div class="rlkwp-toggle-row"><label><input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[enable_content]" value="1" <?php checked( $settings['enable_content'] ); ?>><span><?php esc_html_e( 'Post content', 'relikes' ); ?></span></label><label><input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[enable_comments]" value="1" <?php checked( $settings['enable_comments'] ); ?>><span><?php esc_html_e( 'Approved comments', 'relikes' ); ?></span></label></div></section>

					<section class="rlkwp-card"><div class="rlkwp-card__heading"><span>2</span><div><h2><?php esc_html_e( 'Reader access', 'relikes' ); ?></h2><p><?php esc_html_e( 'Keep the established reaction behavior while controlling who can participate.', 'relikes' ); ?></p></div></div><label class="rlkwp-switch"><input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[show_heatmap]" value="1" <?php checked( $settings['show_heatmap'] ); ?>><span><?php esc_html_e( 'Show My reactions / Heatmap switch', 'relikes' ); ?></span></label><label class="rlkwp-switch"><input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[allow_anonymous]" value="1" <?php checked( $settings['allow_anonymous'] ); ?>><span><?php esc_html_e( 'Allow signed anonymous reader sessions', 'relikes' ); ?></span></label><div class="rlkwp-field-grid rlkwp-field-grid--compact"><?php $this->render_number_field( $settings, 'anonymous_retention_days', __( 'Anonymous retention', 'relikes' ), 1, 730, 1, __( 'days', 'relikes' ) ); ?></div></section>

					<section class="rlkwp-card rlkwp-card--wide"><div class="rlkwp-card__heading"><span>3</span><div><h2><?php esc_html_e( 'Selection brush', 'relikes' ); ?></h2><p><?php esc_html_e( 'These Clean Selection visuals apply while a reader is choosing a passage.', 'relikes' ); ?></p></div></div><div class="rlkwp-field-grid">
						<?php $this->render_color_field( $settings, 'selection_color', __( 'Selection color', 'relikes' ) ); ?>
						<label class="rlkwp-field"><span class="rlkwp-field__label"><?php esc_html_e( 'Cursor', 'relikes' ); ?></span><select name="<?php echo esc_attr( self::OPTION ); ?>[cursor]"><option value="" <?php selected( $settings['cursor'], '' ); ?>><?php esc_html_e( 'Browser / theme default', 'relikes' ); ?></option><option value="crosshair" <?php selected( $settings['cursor'], 'crosshair' ); ?>><?php esc_html_e( 'Crosshair', 'relikes' ); ?></option><option value="default" <?php selected( $settings['cursor'], 'default' ); ?>><?php esc_html_e( 'Arrow', 'relikes' ); ?></option><option value="text" <?php selected( $settings['cursor'], 'text' ); ?>><?php esc_html_e( 'Text cursor', 'relikes' ); ?></option></select></label>
						<?php $this->render_number_field( $settings, 'brush_hardness', __( 'Hardness', 'relikes' ), 0.05, 0.85, 0.05 ); ?><?php $this->render_number_field( $settings, 'brush_max_alpha', __( 'In-progress opacity', 'relikes' ), 0.05, 0.4, 0.01 ); ?><?php $this->render_number_field( $settings, 'brush_spacing', __( 'Stamp spacing', 'relikes' ), 0.15, 0.75, 0.05 ); ?><?php $this->render_number_field( $settings, 'brush_turbulence', __( 'Turbulence', 'relikes' ), 0, 0.6, 0.05 ); ?><?php $this->render_number_field( $settings, 'brush_turbulence_speed', __( 'Turbulence speed', 'relikes' ), 0.1, 1.2, 0.05 ); ?><?php $this->render_number_field( $settings, 'brush_final_alpha', __( 'Final selection opacity', 'relikes' ), 0.1, 0.6, 0.01 ); ?><?php $this->render_number_field( $settings, 'brush_fade_speed', __( 'Fog fade speed', 'relikes' ), 0.01, 0.08, 0.005 ); ?><?php $this->render_number_field( $settings, 'brush_grow_speed', __( 'Cloud grow speed', 'relikes' ), 0.01, 0.08, 0.005 ); ?><?php $this->render_number_field( $settings, 'brush_padding_ratio', __( 'Selection padding ratio', 'relikes' ), 0.1, 0.6, 0.05 ); ?>
					</div><label class="rlkwp-switch rlkwp-switch--spaced"><input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[center_popup]" value="1" <?php checked( $settings['center_popup'] ); ?>><span><?php esc_html_e( 'Always center the Like / Dislike popup in the visible viewport', 'relikes' ); ?></span></label></section>

					<section class="rlkwp-card rlkwp-card--wide"><div class="rlkwp-card__heading"><span>4</span><div><h2><?php esc_html_e( 'Reaction clouds and heatmap', 'relikes' ); ?></h2><p><?php esc_html_e( 'Configure the persistent Like/Dislike layer independently from the active selection color.', 'relikes' ); ?></p></div></div><div class="rlkwp-field-grid">
						<?php $this->render_color_field( $settings, 'like_color', __( 'Like color', 'relikes' ) ); ?><?php $this->render_color_field( $settings, 'dislike_color', __( 'Dislike color', 'relikes' ) ); ?><?php $this->render_number_field( $settings, 'reaction_alpha', __( 'My reaction opacity', 'relikes' ), 0.05, 0.8, 0.01 ); ?><?php $this->render_number_field( $settings, 'cloud_padding_ratio', __( 'Persistent cloud padding', 'relikes' ), 0.1, 0.6, 0.01 ); ?>
						<label class="rlkwp-field"><span class="rlkwp-field__label"><?php esc_html_e( 'Heatmap scale', 'relikes' ); ?></span><select name="<?php echo esc_attr( self::OPTION ); ?>[heatmap_scale]"><option value="linear" <?php selected( $settings['heatmap_scale'], 'linear' ); ?>><?php esc_html_e( 'Linear', 'relikes' ); ?></option><option value="sqrt" <?php selected( $settings['heatmap_scale'], 'sqrt' ); ?>><?php esc_html_e( 'Square root', 'relikes' ); ?></option><option value="log" <?php selected( $settings['heatmap_scale'], 'log' ); ?>><?php esc_html_e( 'Logarithmic', 'relikes' ); ?></option></select></label><?php $this->render_number_field( $settings, 'heatmap_min_alpha', __( 'Heatmap minimum opacity', 'relikes' ), 0, 0.4, 0.01 ); ?><?php $this->render_number_field( $settings, 'heatmap_max_alpha', __( 'Heatmap maximum opacity', 'relikes' ), 0.1, 0.75, 0.01 ); ?>
					</div><div class="rlkwp-subcard-grid"><?php $this->render_geometry_card( $settings, 'content', __( 'Post geometry', 'relikes' ), __( 'For regular post and page typography.', 'relikes' ) ); ?><?php $this->render_geometry_card( $settings, 'comment', __( 'Comment geometry', 'relikes' ), __( 'For typically smaller comment typography.', 'relikes' ) ); ?></div></section>

					<section class="rlkwp-card"><div class="rlkwp-card__heading"><span>5</span><div><h2><?php esc_html_e( 'Reader control bar', 'relikes' ); ?></h2><p><?php esc_html_e( 'Customize the My reactions / Heatmap switch and clear action.', 'relikes' ); ?></p></div></div><label class="rlkwp-field"><span class="rlkwp-field__label"><?php esc_html_e( 'Appearance', 'relikes' ); ?></span><select name="<?php echo esc_attr( self::OPTION ); ?>[control_appearance]"><option value="default" <?php selected( $settings['control_appearance'], 'default' ); ?>><?php esc_html_e( 'Styled default', 'relikes' ); ?></option><option value="theme" <?php selected( $settings['control_appearance'], 'theme' ); ?>><?php esc_html_e( 'Theme-controlled variables', 'relikes' ); ?></option></select></label><div class="rlkwp-field-grid rlkwp-field-grid--compact"><?php $this->render_color_field( $settings, 'control_accent_color', __( 'Active background', 'relikes' ) ); ?><?php $this->render_color_field( $settings, 'control_background_color', __( 'Track background', 'relikes' ) ); ?><?php $this->render_color_field( $settings, 'control_border_color', __( 'Border', 'relikes' ) ); ?><?php $this->render_color_field( $settings, 'control_text_color', __( 'Inactive text', 'relikes' ) ); ?><?php $this->render_color_field( $settings, 'control_active_text_color', __( 'Active text', 'relikes' ) ); ?><?php $this->render_color_field( $settings, 'control_clear_color', __( 'Clear action', 'relikes' ) ); ?><?php $this->render_number_field( $settings, 'control_radius', __( 'Corner radius', 'relikes' ), 0, 999, 1, 'px' ); ?></div></section>

					<section class="rlkwp-card"><div class="rlkwp-card__heading"><span>6</span><div><h2><?php esc_html_e( 'Touch control', 'relikes' ); ?></h2><p><?php esc_html_e( 'Optional Select/Deselect control for touchscreens.', 'relikes' ); ?></p></div></div><label class="rlkwp-switch"><input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[touch_bar]" value="1" <?php checked( $settings['touch_bar'] ); ?>><span><?php esc_html_e( 'Show Select/Deselect on touchscreens', 'relikes' ); ?></span></label><div class="rlkwp-field-grid rlkwp-field-grid--compact"><label class="rlkwp-field"><span class="rlkwp-field__label"><?php esc_html_e( 'Placement', 'relikes' ); ?></span><select name="<?php echo esc_attr( self::OPTION ); ?>[touch_bar_placement]"><option value="top" <?php selected( $settings['touch_bar_placement'], 'top' ); ?>><?php esc_html_e( 'Top', 'relikes' ); ?></option><option value="bottom" <?php selected( $settings['touch_bar_placement'], 'bottom' ); ?>><?php esc_html_e( 'Bottom', 'relikes' ); ?></option><option value="floating" <?php selected( $settings['touch_bar_placement'], 'floating' ); ?>><?php esc_html_e( 'Floating island', 'relikes' ); ?></option></select></label><label class="rlkwp-field"><span class="rlkwp-field__label"><?php esc_html_e( 'Edge offset', 'relikes' ); ?></span><input class="code" type="text" name="<?php echo esc_attr( self::OPTION ); ?>[touch_bar_offset]" value="<?php echo esc_attr( $settings['touch_bar_offset'] ); ?>"></label></div></section>

					<details class="rlkwp-card rlkwp-card--wide rlkwp-advanced"><summary><?php esc_html_e( 'Advanced selectors and instance keys', 'relikes' ); ?></summary><div class="rlkwp-field-grid"><label class="rlkwp-field"><span class="rlkwp-field__label"><?php esc_html_e( 'Post content selector', 'relikes' ); ?></span><input class="code" type="text" name="<?php echo esc_attr( self::OPTION ); ?>[content_selector]" value="<?php echo esc_attr( $settings['content_selector'] ); ?>"></label><label class="rlkwp-field"><span class="rlkwp-field__label"><?php esc_html_e( 'Comment content selector', 'relikes' ); ?></span><input class="code" type="text" name="<?php echo esc_attr( self::OPTION ); ?>[comment_selector]" value="<?php echo esc_attr( $settings['comment_selector'] ); ?>"></label><label class="rlkwp-field"><span class="rlkwp-field__label"><?php esc_html_e( 'Allowed instance keys', 'relikes' ); ?></span><input class="code" type="text" name="<?php echo esc_attr( self::OPTION ); ?>[instance_keys]" value="<?php echo esc_attr( $settings['instance_keys'] ); ?>"><small><?php esc_html_e( 'Comma-separated stable data-relikes-instance values.', 'relikes' ); ?></small></label></div></details>

					<section class="rlkwp-card rlkwp-card--wide rlkwp-danger"><h2><?php esc_html_e( 'Uninstall', 'relikes' ); ?></h2><label class="rlkwp-switch"><input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[delete_data_on_uninstall]" value="1" <?php checked( $settings['delete_data_on_uninstall'] ); ?>><span><?php esc_html_e( 'Delete all Re:Likes tables and settings when the plugin is uninstalled', 'relikes' ); ?></span></label></section>
				</div>
				<div class="rlkwp-save"><div><strong><?php esc_html_e( 'Ready to update the reaction experience?', 'relikes' ); ?></strong><span><?php esc_html_e( 'Visual settings apply on the next frontend page load.', 'relikes' ); ?></span></div><?php submit_button( __( 'Save Re:Likes settings', 'relikes' ), 'primary', 'submit', false ); ?></div>
			</form>
		</div>
		<?php
	}

	private function selected_post_types( $settings = null ) {
		$settings = $settings ?: $this->settings();
		$extra    = preg_split( '/[\s,]+/', $settings['additional_post_types'], -1, PREG_SPLIT_NO_EMPTY );
		return array_values( array_diff( array_unique( array_merge( $settings['post_types'], array_map( 'sanitize_key', $extra ) ) ), array( 'attachment' ) ) );
	}

	public function enqueue_frontend() {
		if ( is_admin() || is_feed() || ! is_singular() ) {
			return;
		}
		$settings  = $this->settings();
		$post_id   = get_queried_object_id();
		$post_type = get_post_type( $post_id );
		if ( ! in_array( $post_type, $this->selected_post_types( $settings ), true ) ) {
			return;
		}
		if ( ! $settings['enable_content'] && ! $settings['enable_comments'] ) {
			return;
		}
		if ( ! is_user_logged_in() && ! $settings['allow_anonymous'] ) {
			return;
		}

		if ( ! wp_script_is( 'clean-selection-core', 'registered' ) ) {
			// Readable source files ship beside the operational minified core builds.
			wp_register_script( 'clean-selection-core', RELIKES_WP_URL . 'assets/js/cleanselection.min.js', array(), CLEAN_SELECTION_CORE_VERSION, true );
		}
		wp_enqueue_script( 'clean-selection-core' );
		wp_enqueue_style( 'relikes-wp', RELIKES_WP_URL . 'assets/css/relikes-wp.css', array(), RELIKES_WP_VERSION );
		wp_enqueue_script( 'relikes-core', RELIKES_WP_URL . 'assets/js/relikes.min.js', array( 'clean-selection-core' ), RELIKES_WP_VERSION, true );
		wp_enqueue_script( 'relikes-wp', RELIKES_WP_URL . 'assets/js/relikes-wp.js', array( 'relikes-core' ), RELIKES_WP_VERSION, true );

		$config = array(
			'postId'            => $post_id,
			'enableContent'     => (bool) $settings['enable_content'],
			'enableComments'    => (bool) $settings['enable_comments'],
			'contentSelector'   => $settings['content_selector'],
			'commentSelector'   => $settings['comment_selector'],
			'showHeatmap'       => (bool) $settings['show_heatmap'],
			'likeColor'         => $settings['like_color'],
			'dislikeColor'      => $settings['dislike_color'],
			'reactionAlpha'     => (float) $settings['reaction_alpha'],
			'centerPopup'       => (bool) $settings['center_popup'],
			'touchBar'          => (bool) $settings['touch_bar'],
			'touchBarPlacement' => $settings['touch_bar_placement'],
			'touchBarOffset'    => $settings['touch_bar_offset'],
			'visual'            => array(
				'selectionColor'   => $settings['selection_color'],
				'cloudPaddingRatio'=> (float) $settings['cloud_padding_ratio'],
				'brush'            => array(
					'hardness'         => (float) $settings['brush_hardness'],
					'maxAlpha'         => (float) $settings['brush_max_alpha'],
					'spacing'          => (float) $settings['brush_spacing'],
					'turbulence'       => (float) $settings['brush_turbulence'],
					'turbulenceSpeed'  => (float) $settings['brush_turbulence_speed'],
					'finalAlpha'       => (float) $settings['brush_final_alpha'],
					'fadeSpeed'        => (float) $settings['brush_fade_speed'],
					'finalGrowSpeed'   => (float) $settings['brush_grow_speed'],
					'paddingRatio'     => (float) $settings['brush_padding_ratio'],
					'cursor'           => $settings['cursor'],
				),
				'content'          => array(
					'radius'          => (float) $settings['content_radius'],
					'overlayPadding'  => (float) $settings['content_overlay_padding'],
					'virtualPadding'  => (float) $settings['content_virtual_padding'],
					'detectTolerance' => (float) $settings['content_detect_tolerance'],
				),
				'comment'          => array(
					'radius'          => (float) $settings['comment_radius'],
					'overlayPadding'  => (float) $settings['comment_overlay_padding'],
					'virtualPadding'  => (float) $settings['comment_virtual_padding'],
					'detectTolerance' => (float) $settings['comment_detect_tolerance'],
				),
				'heatmap'          => array(
					'scale'    => $settings['heatmap_scale'],
					'minAlpha' => (float) $settings['heatmap_min_alpha'],
					'maxAlpha' => (float) $settings['heatmap_max_alpha'],
				),
				'controls'         => array(
					'appearance' => $settings['control_appearance'],
					'accent'     => $settings['control_accent_color'],
					'background' => $settings['control_background_color'],
					'border'     => $settings['control_border_color'],
					'text'       => $settings['control_text_color'],
					'activeText' => $settings['control_active_text_color'],
					'clear'      => $settings['control_clear_color'],
					'radius'     => (int) $settings['control_radius'],
				),
			),
			'restUrl'           => trailingslashit( rest_url( 'relikes/v1' ) ),
			'restRoutes'        => array(
				'session'   => rest_url( 'relikes/v1/session' ),
				'reactions' => rest_url( 'relikes/v1/reactions' ),
				'heatmap'   => rest_url( 'relikes/v1/heatmap' ),
			),
			'nonce'             => is_user_logged_in() ? wp_create_nonce( 'wp_rest' ) : '',
			'userId'            => is_user_logged_in() ? 'wp-user-' . get_current_user_id() : null,
			'documentVersion'   => 'wp-v1',
			'labels'            => array(
				'mine'    => __( 'My reactions', 'relikes' ),
				'heatmap' => __( 'Heatmap', 'relikes' ),
				'clear'   => __( 'Clear my reactions', 'relikes' ),
				'status'  => __( 'Reaction sync status', 'relikes' ),
			),
		);
		$config = apply_filters( 'relikes_wp_frontend_config', $config, $settings );
		wp_add_inline_script( 'relikes-wp', 'window.RelikesWPConfig = ' . wp_json_encode( $config ) . ';', 'before' );
	}

	public function document_scope( $document_id ) {
		if ( ! preg_match( '/^(post|comment):(\d+):([A-Za-z0-9_-]{1,64})$/', $document_id, $match ) ) {
			return new \WP_Error( 'invalid_document', __( 'This Re:Likes document identifier is invalid.', 'relikes' ), array( 'status' => 400 ) );
		}
		$settings          = $this->settings();
		$type              = $match[1];
		$id                = (int) $match[2];
		$allowed_instances = preg_split( '/[\s,]+/', $settings['instance_keys'], -1, PREG_SPLIT_NO_EMPTY );
		$instance_allowed  = in_array( $match[3], $allowed_instances, true );
		$instance_allowed  = (bool) apply_filters( 'relikes_wp_allow_instance', $instance_allowed, $match[3], $type, $id );
		if ( ! $instance_allowed ) {
			return new \WP_Error( 'instance_not_allowed', __( 'This Re:Likes instance key is not allowed.', 'relikes' ), array( 'status' => 403 ) );
		}
		if ( 'post' === $type ) {
			if ( empty( $settings['enable_content'] ) ) {
				return new \WP_Error( 'surface_disabled', __( 'Post reactions are disabled.', 'relikes' ), array( 'status' => 403 ) );
			}
			$post = get_post( $id );
		} else {
			if ( empty( $settings['enable_comments'] ) ) {
				return new \WP_Error( 'surface_disabled', __( 'Comment reactions are disabled.', 'relikes' ), array( 'status' => 403 ) );
			}
			$comment = get_comment( $id );
			if ( ! $comment || ( '1' !== (string) $comment->comment_approved && ! current_user_can( 'moderate_comments' ) ) ) {
				return new \WP_Error( 'document_not_found', __( 'The requested comment is not available.', 'relikes' ), array( 'status' => 404 ) );
			}
			$post = get_post( $comment->comment_post_ID );
		}

		if ( ! $post || ! in_array( $post->post_type, $this->selected_post_types( $settings ), true ) ||
			( 'publish' !== $post->post_status && ! current_user_can( 'read_post', $post->ID ) ) ) {
			return new \WP_Error( 'document_not_found', __( 'The requested document is not available.', 'relikes' ), array( 'status' => 404 ) );
		}
		return array( 'type' => $type, 'id' => $id, 'instance' => $match[3], 'post_id' => (int) $post->ID );
	}

	public function purge_post( $post_id ) {
		if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
			return;
		}
		$this->storage->purge_document_prefix( 'post:' . absint( $post_id ) . ':' );
	}

	public function purge_comment( $comment_id ) {
		$this->storage->purge_document_prefix( 'comment:' . absint( $comment_id ) . ':' );
	}

	public function purge_comment_transition( $new_status, $old_status, $comment ) {
		if ( $new_status !== $old_status ) {
			$this->purge_comment( $comment->comment_ID );
		}
	}

	public function register_exporter( $exporters ) {
		$exporters['relikes'] = array( 'exporter_friendly_name' => __( 'Re:Likes reactions', 'relikes' ), 'callback' => array( $this, 'export_personal_data' ) );
		return $exporters;
	}

	public function export_personal_data( $email_address, $page = 1 ) {
		$user = get_user_by( 'email', $email_address );
		if ( ! $user || $page > 1 ) {
			return array( 'data' => array(), 'done' => true );
		}
		$rows = $this->storage->export_user( $user->ID );
		$data = array();
		foreach ( $rows as $index => $row ) {
			$data[] = array(
				'group_id'    => 'relikes-reactions',
				'group_label' => __( 'Re:Likes reactions', 'relikes' ),
				'item_id'     => 'relikes-' . $index,
				'data'        => array(
					array( 'name' => __( 'Document', 'relikes' ), 'value' => $row['document_key'] ),
					array( 'name' => __( 'Reaction', 'relikes' ), 'value' => $row['kind'] ),
					array( 'name' => __( 'Text offsets', 'relikes' ), 'value' => $row['start_offset'] . '-' . $row['end_offset'] ),
					array( 'name' => __( 'Updated', 'relikes' ), 'value' => $row['updated_at'] ),
				),
			);
		}
		return array( 'data' => $data, 'done' => true );
	}

	public function register_eraser( $erasers ) {
		$erasers['relikes'] = array( 'eraser_friendly_name' => __( 'Re:Likes reactions', 'relikes' ), 'callback' => array( $this, 'erase_personal_data' ) );
		return $erasers;
	}

	public function erase_personal_data( $email_address, $page = 1 ) {
		$user = get_user_by( 'email', $email_address );
		if ( $user && 1 === (int) $page ) {
			$this->storage->purge_user( $user->ID );
		}
		return array( 'items_removed' => (bool) $user, 'items_retained' => false, 'messages' => array(), 'done' => true );
	}
}
