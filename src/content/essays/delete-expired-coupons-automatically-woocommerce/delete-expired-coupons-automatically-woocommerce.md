---
title: Automatically Delete Expired Coupons in WooCommerce
date: 2018-08-01T10:00:00
updated: 2025-11-18T07:43:41
draft: false
excerpt: Automatically remove expired WooCommerce coupons daily so your database
  stays lean and your marketing screen uncluttered.
categories:
  - Programming
tags:
  - Performance
  - PHP
  - Productivity
  - WordPress
coverAlt: Pexels photo
coverCaption: Photo by Antoni Shkraba Studio on Pexels.com
originalCover: https://buthonestly.io/wp-content/uploads/2018/08/pexels-photo-6207767.jpeg
---

Do you still have hundreds of expired coupons sitting in your database?

> [!summary]- Quick Summary
>
> -   Expired WooCommerce coupons pile up over time, cluttering the admin area and adding pointless weight to your database and backups.
> -   A small PHP snippet runs daily via WP-Cron, finds expired coupons, and moves them to the Trash automatically.
> -   You can switch to permanent deletion if you’re sure you’ll never need those coupons again.
> -   The same cleanup logic is available on demand through a Delete Expired Coupons button in Marketing → Coupons.
> -   Keeping expired coupons under control is a simple automation win that makes store maintenance faster and cleaner.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

If you’re giving discounts to first-time buyers or loyal customers, chances are your store creates coupons automatically. That’s great, everyone loves a discount. But once those coupons expire, WooCommerce doesn’t delete them. They just sit there, taking up space for no reason.

Let’s fix that.

## Why You Should Delete Expired Coupons

Expired coupons serve no purpose once they’ve passed their expiry date. Keeping them:

-   Slows down your database queries slightly over time.
-   Makes your **Marketing → Coupons** page cluttered.
-   Adds unnecessary data to your backups.

In short, it’s a small performance and housekeeping issue that’s easy to solve with a bit of automation.

## The Snippet to Clean Up Expired Coupons Automatically

You are about to edit PHP. Even a missing semicolon can break your site. Before you make any code changes, have a backup of your site. This will help you restore things if something goes wrong. I recommend using Jetpack Backup for real-time backups and one-click restores.

Open your **functions.php** file in **wp-content/themes/your-child-theme-name/** and add this code at the end of the file:

/\*\*
 \* @snippet       Delete Expired Coupons Automatically
 \* @author        Nicola Mustone
 \* @author\_url    https://buthonestly.io/programming/delete-expired-coupons-automatically-woocommerce/
 \* @tested-up-to  WooCommerce 10.3.X
 \* @license       GPLv2
 \*/

add\_action('delete\_expired\_coupons\_hook', function () {
    $expired = new WP\_Query(\[
        'fields'         => 'ids',
        'post\_type'      => 'shop\_coupon',
        'post\_status'    => 'any',
        'posts\_per\_page' => 500,
        'no\_found\_rows'  => true,
        'orderby'        => 'ID',
        'order'          => 'ASC',
        'meta\_query'     => \[
            // has an expiry date
            \[ 'key' => 'date\_expires', 'compare' => 'EXISTS' \],
            // already expired
            \[ 'key' => 'date\_expires', 'value' => time(), 'compare' => '<', 'type' => 'NUMERIC' \],
            // exclude AutomateWoo
            \[ 'key' => '\_is\_aw\_coupon', 'value' => false \],
        \],
    \]);

    foreach ( $expired->posts as $coupon\_id ) {
        wp\_trash\_post( $coupon\_id );
    }
});

add\_action('init', function () {
    if ( ! wp\_next\_scheduled('delete\_expired\_coupons\_hook') ) {
        wp\_schedule\_event( time(), 'daily', 'delete\_expired\_coupons\_hook' );
    }
});

add\_action('restrict\_manage\_posts', function () {
    if ( 'shop\_coupon' !== ( $GLOBALS\['typenow'\] ?? '' ) ) return; ?>
    <form method="post" style="display:inline;">
        <input type="hidden" name="custom\_action" value="delete\_expired\_coupons">
        <?php wp\_nonce\_field('custom\_delete\_expired\_coupons','custom\_delete\_nonce'); ?>
        <input type="submit" class="button" value="Delete Expired Coupons"
               onclick="return confirm('Delete all expired coupons now?');" />
    </form>
    <?php if ( isset($\_GET\['custom\_deleted'\]) && 'true' === $\_GET\['custom\_deleted'\] ) {
        echo '<div class="updated"><p>Expired coupons deleted.</p></div>';
    }
});

add\_action('admin\_init', function () {
    if ( isset($\_POST\['custom\_action'\], $\_POST\['custom\_delete\_nonce'\])
         && 'delete\_expired\_coupons' === $\_POST\['custom\_action'\]
         && wp\_verify\_nonce($\_POST\['custom\_delete\_nonce'\], 'custom\_delete\_expired\_coupons') ) {
        do\_action('delete\_expired\_coupons\_hook');
        wp\_redirect( add\_query\_arg(\['custom\_deleted'=>'true'\], admin\_url('edit.php?post\_type=shop\_coupon')) );
        exit;
    }
});

## How It Works

This snippet runs a daily check through your WooCommerce coupons and automatically moves any expired ones to the Trash.  
From there, you can delete them permanently with one click, regardless of whether they’ve been used or not.

If you prefer to delete them permanently right away, change this line:

wp\_trash\_post( $coupon->ID );

to:

wp\_delete\_post( $coupon->ID, true );

Be careful: once a coupon is permanently deleted, it can’t be recovered.

This snippet relies on WordPress’ built-in cron system. If you’ve disabled WP-Cron or it’s not running on your hosting setup, the automatic cleanup won’t trigger. In that case, either enable WP-Cron or use a server-side cron job to call `wp-cron.php` regularly.

## Manual Cleanup Option

The snippet also adds a Delete Expired Coupons button in **Marketing → Coupons**.

Clicking this will trigger the same cleanup process immediately. However, if you have hundreds or thousands of coupons, this manual method might take a while and could even hit a timeout. So let the daily cleanup handle it automatically whenever possible.

## Keep Your WooCommerce Store Clean

Expired coupons may seem harmless, but cleaning them up automatically keeps your database lean and your admin area tidy. It’s one of those small optimizations that makes managing a store a bit smoother every day.

What’s your take on this? Have you implemented a similar cleanup process? Share your experience in the comments below.
