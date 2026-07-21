---
title: How to Disable GTIN for Non-Eligible WooCommerce Products
date: 2023-11-20T09:00:00
updated: 2025-11-18T07:43:41
sticky: false
cornerstone: false
excerpt: Tell Google which WooCommerce products lack GTINs by outputting identifier_exists “no” only for truly exempt items.
categories:
  - Programming
tags:
  - PHP
  - WordPress
coverAlt: A close-up shot of a hand holding a black clothing price tag with the word "Brand" on it while a retail scanner scans the barcode.
coverCaption: Photo by <a href="https://www.pexels.com/@karolina-grabowska/">Karolina Grabowska</a> on <a href="https://www.pexels.com/">Pexels.com</a>
originalCover:
cover: barcode-gtin-woocommerce.jpg
---

> [!summary]- Quick Summary
>
> - GTINs power product discoverability and are often required by Google Merchant, but handmade, vintage, or custom products legitimately lack them.
> - Google still looks for identifiers, so “missing” GTINs can trigger warnings unless you explicitly say the product has no identifier.
> - A small PHP filter sets `identifier_exists` to `no` in WooCommerce structured data, signaling to Google that GTIN is not applicable.
> - For mixed catalogs, you can limit this behavior to a specific “no GTIN” product category so eligible products remain unaffected.
> - Apply this only to genuinely GTIN-free products; otherwise, add real GTINs to keep listings healthy.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

In the intricate world of e-commerce, product identification is a crucial aspect of ensuring that your items are easily discoverable and comparable across the vast online marketplace.

For many WooCommerce store owners, providing a Global Trade Item Number (GTIN) is an essential part of this process, particularly when integrating with Google Merchant.

However, not every product comes with or requires a GTIN. For those unique cases, there’s a streamlined solution that can help maintain compliance without unnecessary complications.

## Understanding GTIN and Its Implications for Your WooCommerce Store

Before we dive into the technical snippet, let’s briefly discuss what a GTIN is. A GTIN is a unique product identifier used worldwide to identify individual products. Google Merchant, among other platforms, uses this system to manage product listings. Ensuring that your products have accurate GTINs when necessary is vital for maintaining product visibility and integrity across the online shopping landscape.

### When Does a Product Not Need a GTIN?

Not every product sold needs a GTIN. Handmade items, vintage goods, or custom products often do not have a GTIN. Google recognizes this and does not require GTINs for such non-standard items. However, their system still looks for this information, and it’s crucial to communicate when a product genuinely does not have a GTIN to avoid data errors and potential listing issues.

## Implementing the GTIN Exemption in WooCommerce

You are about to edit PHP. Even a missing semicolon can break your site. Before you make any code changes, have a backup of your site. This will help you restore things if something goes wrong. I recommend using Jetpack Backup for real-time backups and one-click restores.

For those special cases where your products do not require a GTIN, inserting the following PHP snippet into your theme’s functions.php file or a custom plugin can indicate to Google’s systems that the identifier does not exist:

```php
/**
 * @snippet       Add identifier_exists set to False in the Product schema
 * @author        Nicola Mustone
 * @author_url    https://buthonestly.io/programming/disable-gtin-requirements-non-eligible-woocommerce-products/
 * @tested-up-to  WooCommerce 10.3.X
 * @license       GPLv2
 */
add_filter( 'woocommerce_structured_data_product', 'nm_add_identifier_exists_false' );
function nm_add_identifier_exists_false( $markup ) {
    $markup['identifier_exists'] = 'no';
    return $markup;
}
```

By adding this filter, you instruct WooCommerce to output structured data that indicates to Google that an identifier for the product doesn’t exist and isn’t necessary. It’s a small but powerful addition to your WooCommerce setup that can save a lot of headaches for non-standard product sellers.

## A Word of Caution Before Proceeding

This adjustment should not be taken lightly. It’s not a blanket solution for all your products but a targeted fix for those unique items lacking a GTIN. Applying this filter to products that should have a GTIN can lead to issues with Google Merchants and affect your product listings adversely. Ensure that you apply this only to the relevant products in your catalog.

If your catalog has a mix of products that need GTIN and others that do not, you can add a category to those that DO NOT need a GTIN and use this snippet instead to add the exception for products in that category only:

```php
/**
 * @snippet       Add identifier_exists set to False in the Product schema, conditionally
 * @author        Nicola Mustone
 * @author_url    https://buthonestly.io/programming/disable-gtin-requirements-non-eligible-woocommerce-products/
 * @tested-up-to  WooCommerce 10.3.X
 * @license       GPLv2
 */
add_filter( 'woocommerce_structured_data_product', 'nm_conditional_identifier_exists_false', 10, 2 );
function nm_conditional_identifier_exists_false( $markup, $product ) {
    // Replace 'your-category-slug' with the actual slug of the category you want to target.
    $target_category_slug = 'your-category-slug';

    if ( has_term( $target_category_slug, 'product_cat', $product->get_id() ) ) {
        $markup['identifier_exists'] = 'no';
    }

    return $markup;
}
```

Make sure to replace `your-category-slug` with the slug of the category you’re using to mark products that DO NOT need a GTIN.

## For Products with GTINs: A Different Path

If your products do have GTINs, you should follow a different path. Properly adding GTINs to your products ensures better visibility and could enhance your product’s performance in Google’s ecosystem. For a comprehensive guide on adding GTINs to your WooCommerce products using Yoast SEO, refer to [this detailed tutorial](https://yoast.com/help/how-to-add-product-identifiers-with-woocommerce-seo/).

## Final Thoughts

Whether your product assortment includes unique items without GTINs or a mix containing standard products with identifiers, it’s crucial to manage your product data with precision and care. Utilizing the snippet provided, you can effectively navigate the GTIN requirements for your specific needs, ensuring that your WooCommerce store remains compliant and your products discoverable.

For WooCommerce store owners looking to tailor their product data even further, [the archive of technical articles](/section/programming/ "Programming") offers a wealth of knowledge to help you refine your e-commerce operations.
