---
title: Automatically Delete Expired Coupons in WooCommerce
date: 2018-08-01T10:00:00
updated: 2025-11-18T07:43:41
sticky: false
cornerstone: false
excerpt: Automatically remove expired WooCommerce coupons daily so your database stays lean and your marketing screen uncluttered.
categories:
  - Programming
tags:
  - Performance
  - PHP
  - Productivity
  - WordPress
coverAlt: Two hands hold a colorful amusement park ticket reading "ADMIT ONE" and "FUN PASS AMUSEMENT PARK" against a dark background.
coverCaption: Photo by <a href="https://www.pexels.com/@shkrabaanthony/">Antoni Shkraba Studio</a> on <a href="https://www.pexels.com/">Pexels.com</a>
cover: delete-expired-coupons.jpg
---

> [!summary]- Quick Summary
>
> - Expired WooCommerce coupons pile up over time, cluttering the admin area and adding pointless weight to your database and backups.
> - A small PHP snippet runs daily via WP-Cron, finds expired coupons, and moves them to the Trash automatically.
> - You can switch to permanent deletion if you’re sure you’ll never need those coupons again.
> - The same cleanup logic is available on demand through a Delete Expired Coupons button in Marketing → Coupons.
> - Keeping expired coupons under control is a simple automation win that makes store maintenance faster and cleaner.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

Do you still have hundreds of expired coupons sitting in your database?

If you’re giving discounts to first-time buyers or loyal customers, chances are your store creates coupons automatically. That’s great, everyone loves a discount. But once those coupons expire, WooCommerce doesn’t delete them. They just sit there, taking up space for no reason.

Let’s fix that.

## Why You Should Delete Expired Coupons

Expired coupons serve no purpose once they’ve passed their expiry date. Keeping them:

- Slows down your database queries slightly over time.
- Makes your **Marketing → Coupons** page cluttered.
- Adds unnecessary data to your backups.

In short, it’s a small performance and housekeeping issue that’s easy to solve with a bit of automation.

## The Snippet to Clean Up Expired Coupons Automatically

You are about to edit PHP. Even a missing semicolon can break your site. Before you make any code changes, have a backup of your site. This will help you restore things if something goes wrong. I recommend using Jetpack Backup for real-time backups and one-click restores.

Open your **functions.php** file in **wp-content/themes/your-child-theme-name/** and add this code at the end of the file:

```php
/**
 * @snippet       Delete Expired Coupons Automatically
 * @author        Nicola Mustone
 * @author_url    https://buthonestly.io/programming/delete-expired-coupons-automatically-woocommerce/
 * @tested-up-to  WooCommerce 10.3.X
 * @license       GPLv2
 */

add_action('delete_expired_coupons_hook', function () {
    $expired = new WP_Query([
        'fields'         => 'ids',
        'post_type'      => 'shop_coupon',
        'post_status'    => 'any',
        'posts_per_page' => 500,
        'no_found_rows'  => true,
        'orderby'        => 'ID',
        'order'          => 'ASC',
        'meta_query'     => [
            // has an expiry date
            [ 'key' => 'date_expires', 'compare' => 'EXISTS' ],
            // already expired
            [ 'key' => 'date_expires', 'value' => time(), 'compare' => '<', 'type' => 'NUMERIC' ],
            // exclude AutomateWoo
            [ 'key' => '_is_aw_coupon', 'value' => false ],
        ],
    ]);

    foreach ( $expired->posts as $coupon_id ) {
        wp_trash_post( $coupon_id );
    }
});

add_action('init', function () {
    if ( ! wp_next_scheduled('delete_expired_coupons_hook') ) {
        wp_schedule_event( time(), 'daily', 'delete_expired_coupons_hook' );
    }
});

add_action('restrict_manage_posts', function () {
    if ( 'shop_coupon' !== ( $GLOBALS['typenow'] ?? '' ) ) return; ?>
    <form method="post" style="display:inline;">
        <input type="hidden" name="custom_action" value="delete_expired_coupons">
        <?php wp_nonce_field('custom_delete_expired_coupons','custom_delete_nonce'); ?>
        <input type="submit" class="button" value="Delete Expired Coupons"
               onclick="return confirm('Delete all expired coupons now?');" />
    </form>
    <?php if ( isset($_GET['custom_deleted']) && 'true' === $_GET['custom_deleted'] ) {
        echo '<div class="updated"><p>Expired coupons deleted.</p></div>';
    }
});

add_action('admin_init', function () {
    if ( isset($_POST['custom_action'], $_POST['custom_delete_nonce'])
         && 'delete_expired_coupons' === $_POST['custom_action']
         && wp_verify_nonce($_POST['custom_delete_nonce'], 'custom_delete_expired_coupons') ) {
        do_action('delete_expired_coupons_hook');
        wp_redirect( add_query_arg(['custom_deleted'=>'true'], admin_url('edit.php?post_type=shop_coupon')) );
        exit;
    }
});
```

## How It Works

This snippet runs a daily check through your WooCommerce coupons and automatically moves any expired ones to the Trash.  
From there, you can delete them permanently with one click, regardless of whether they’ve been used or not.

If you prefer to delete them permanently right away, change this line:

```php
wp_trash_post( $coupon->ID );
```

to:

```php
wp_delete_post( $coupon->ID, true );
```

Be careful: once a coupon is permanently deleted, it can’t be recovered.

This snippet relies on WordPress’ built-in cron system. If you’ve disabled WP-Cron or it’s not running on your hosting setup, the automatic cleanup won’t trigger. In that case, either enable WP-Cron or use a server-side cron job to call `wp-cron.php` regularly.

## Manual Cleanup Option

The snippet also adds a Delete Expired Coupons button in **Marketing → Coupons**.

Clicking this will trigger the same cleanup process immediately. However, if you have hundreds or thousands of coupons, this manual method might take a while and could even hit a timeout. So let the daily cleanup handle it automatically whenever possible.

## Keep Your WooCommerce Store Clean

Expired coupons may seem harmless, but cleaning them up automatically keeps your database lean and your admin area tidy. It’s one of those small optimizations that makes managing a store a bit smoother every day.
