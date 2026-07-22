---
title: "WooCommerce Password Strength Meter: Keep It or Remove It"
date: 2016-01-27T08:33:48
updated: 2026-05-12T20:07:39
sticky: false
cornerstone: false
excerpt: Tweak WooCommerce password strength without wrecking your checkout or your customers’ patience.
categories:
  - Programming
tags:
  - Performance
  - PHP
  - WordPress
coverAlt: Two young children play tug-of-war on a grassy field at sunset; the child in front wears a leather aviator cap.
cover: password-strength.jpg
audioVoice: Enceladus
audioStyle: reflective
audioPace: conversational
---

> [!summary]- Quick Summary
>
> - The WooCommerce password strength meter improves security but often adds friction and hurts checkout completion.
> - You can remove the password strength meter entirely by dequeuing `wc-password-strength-meter`, or keep it and lower the required strength via `woocommerce_min_password_strength`.
> - If you relax or remove it, add a short hint near the password field encouraging unique, non-reused passwords.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

The WooCommerce password strength meter is good for security, but it is bad for some checkouts.

If you run a store, you sit in the middle of that trade-off. You want customers to use strong passwords because a compromised account exposes order data, addresses, and emails. At the same time, you do not want people to get stuck at the most fragile step in your funnel: creating an account while paying.

The strength meter is one more thing that can go wrong there.

There are two solutions to this: you can either remove the meter or keep it and tell WooCommerce to be less strict.

## Why the WooCommerce Password Strength Meter Exists

WooCommerce uses the same password strength logic as WordPress core, powered by [Dropbox’s `zxcvbn` library](https://github.com/dropbox/zxcvbn). The script handle is `wc-password-strength-meter`, and WooCommerce loads it on forms where customers choose a password, such as checkout and My Account.

By default, WooCommerce requires a password with a minimum “strength” value. Internally that strength is a number. Historically it is:

- `0` Very weak
- `1` Weak
- `2` Medium
- `3` Strong (default)
- `4` Very strong (rarely used, but supported)

The goal is simple: give people feedback like “Weak” or “Strong” and stop them from using `password123`.

From a security perspective, this is sensible. Weak passwords are still one of the easiest ways into an account.

## Why People Still Hate It

The complaints have not changed much since 2016, when the password strength meter was first introduced in [WooCommerce 2.5 “Dashing Dolphin”](https://developer.woocommerce.com/2016/01/18/say-hello-to-woocommerce-2-5-dashing-dolphin/).

- Customers see a red or orange “Weak” label and assume they are blocked.
- The meter can be confusing if you use human words like “MyRedHouse!” and the bar still says “Medium”.
- On mobile, fiddling with special characters in a masked field is annoying.

Developers and store owners have been dequeueing this script or lowering the required strength for years exactly because of this friction.

If your audience is not especially technical, a very strict meter may not be worth the drop in completed orders.

You are about to edit PHP. Even a missing semicolon can break your site. Before you make any code changes, have a backup of your site. This will help you restore things if something goes wrong. I recommend using Jetpack Backup for real-time backups and one-click restores.

Once that is in place, you can decide how opinionated you want to be about passwords.

## Option 1: Remove the Password Strength Meter Everywhere

This option removes the password strength meter script from all WooCommerce frontend forms. Customers will no longer see the bar or the “Weak / Strong” labels. Passwords will still need to pass basic WordPress checks, but WooCommerce will not add extra rules.

**Disclaimer**: I do **not** recommend completely removing the WooCommerce password strength meter. Doing so makes it easier for customers and store admins to use weak or reused passwords, which in turn increases the risk of account takeover, fraudulent orders, and data exposure. From [this 2023 analysis](https://wpscan.com/2024-website-threat-report/), the **main entry vector for compromised websites was leaked credentials or brute-force of weak passwords**.

If you decide to relax the meter or customize its behavior, you do so at your own risk and you should consider compensating protections such as two-factor authentication, rate limiting, and good user access hygiene.

Add this to your theme’s `functions.php` or to a small functionality plugin:

```php
/**
 * @snippet       WooCommerce Password Strength Meter: Keep It or Remove It
 * @author        Nicola Mustone
 * @author_url    https://buthonestly.io/programming/woocommerce-password-strength-meter-checkout/
 * @tested-up-to  WooCommerce 10.3.X
 * @license       GPLv2
 */
function bh_remove_woocommerce_password_strength_meter() {
	if ( wp_script_is( 'wc-password-strength-meter', 'enqueued' ) ) {
		wp_dequeue_script( 'wc-password-strength-meter' );
	}
}
add_action( 'wp_enqueue_scripts', 'bh_remove_woocommerce_password_strength_meter', 100 );
```

This snippet has been used since the early WooCommerce 2.x days and still works with current WooCommerce because the script handle is the same.

What this does in practice:

- Checkout: customers can create an account without seeing any strength bar
- My Account: no strength meter when changing passwords
- Registration and reset forms: same story

You get the least friction at the cost of losing an explicit nudge toward safer passwords.

If you do this, I recommend nudging your customers in another way, for example:

> “Use a unique password you do not use anywhere else.”

This kind of hint is cheap to add and still better than nothing. To do that, put this in your theme’s `functions.php` or a small custom plugin:

```php
/**
 * @snippet       WooCommerce Password Strength Meter: Keep It or Remove It
 * @author        Nicola Mustone
 * @author_url    https://buthonestly.io/programming/woocommerce-password-strength-meter-checkout/
 * @tested-up-to  WooCommerce 10.3.X
 * @license       GPLv2
 */
function bh_checkout_password_hint( $fields ) {
	if ( isset( $fields['account']['account_password'] ) ) {
		$fields['account']['account_password']['description'] = __( 'Use a unique password you do not use anywhere else.', 'your-textdomain' );
	}

	return $fields;
}
add_filter( 'woocommerce_checkout_fields', 'bh_checkout_password_hint' );

function bh_account_password_hint() {
	echo '<p class="woocommerce-password-hint">';
	echo esc_html__( 'Use a unique password you do not use anywhere else.', 'your-textdomain' );
	echo '</p>';
}
add_action( 'woocommerce_edit_account_form', 'bh_account_password_hint', 5 );
```

What this does:

- Targets the “Create account password” field at checkout.
- Adds a small description line under the field with your hint.
- Prints a paragraph near the top of the account edit form. You can move it up or down by adjusting the priority `5` if you want it to appear later.

You can change the text inside `__()` to whatever you want.

## Option 2: Keep the Meter, but Relax the Rule

If you are in favor of the meter but hate how strict it is, you do not have to remove the script. WooCommerce exposes a filter that lets you choose your WooCommerce password strength requirements: `woocommerce_min_password_strength`.

Add this to `functions.php`:

```php
/**
 * @snippet       WooCommerce Password Strength Meter: Keep It or Remove It
 * @author        Nicola Mustone
 * @author_url    https://buthonestly.io/programming/woocommerce-password-strength-meter-checkout/
 * @tested-up-to  WooCommerce 10.3.X
 * @license       GPLv2
 */
function bh_woocommerce_min_password_strength( $strength ) {
	// 4 = Very strong (hardest)
	// 3 = Strong (WooCommerce default)
	// 2 = Medium
	// 1 = Weak
	// 0 = Very weak / anything
	return 2; // Accept Medium and above.
}
add_filter( 'woocommerce_min_password_strength', 'bh_woocommerce_min_password_strength' );
```

A few ideas for values to return:

- `3` if your audience is technical and uses password managers
- `2` if you want a balance between security and fewer support questions
- `1` or `0` if conversion is your top priority and your risk is low

The meter stays visible, which helps people at least think about password quality. It simply stops being a hard wall for everyone who cannot be bothered to generate a 30-character monster.

## Option 3: Use a Plugin Instead of Code

If you would rather not touch PHP at all, there are also general password strength plugins for WooCommerce. For example, plugins like [Password Strength Requirements for WooCommerce](https://wordpress.org/plugins/password-strength-rwc/) or [Password Strength Settings for WooCommerce](https://wordpress.org/plugins/password-strength-for-woocommerce/) expose options for minimum length, numbers, and special characters directly in the admin.

The trade-off is that you add another plugin to maintain, and some of these tools lag behind WooCommerce core versions. Always check:

- Last updated date (for both of these it’s already 1 year ago as of today)
- Tested up to which WordPress and WooCommerce version
- Number of active installs and recent reviews

If you are comfortable editing `functions.php`, **I would still take the code route**. It is one small function, easy to track in version control, and does not depend on a third party.

## How to Decide What to Do

There is no universal right answer for WooCommerce password strength. What makes sense depends entirely on [[10-types-of-websites|what kind of store you're building]] and your actual risk exposure.

Some simple heuristics:

- **High-risk, high-value data**. You store sensitive data or operate in a regulated space → Keep the meter and stay at `3` or higher.
- **Average shop, non-technical audience**. You sell physical goods, payments go through a gateway, and your users struggle with accounts → Lower the requirement to `2` and watch checkout completion.
- **Ultra-casual, low-risk shop**. You sell something low risk to a mainstream audience, and you measure a clear drop at the account step → Consider going to `1` or removing the meter and compensate with good operational security and clear messaging.

Whatever you choose, make it a deliberate decision, not an accident of whichever WooCommerce version you installed years ago.

The strength meter is useful. It is not free. You pay for it with extra friction at the exact moment a customer is trying to pay you.

If that cost is acceptable, keep it. If it is not, now you know how to turn it down.
