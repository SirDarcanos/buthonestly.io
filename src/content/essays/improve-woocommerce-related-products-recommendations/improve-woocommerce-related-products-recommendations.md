---
title: "WooCommerce Related Products: What and How to Improve Them"
date: 2023-12-21T09:00:00
updated: 2025-11-18T07:43:12
sticky: false
cornerstone: false
excerpt: Use attributes, filters, and smarter recommendations to turn
  WooCommerce related products into genuinely helpful upsell suggestions.
categories:
  - Programming
tags:
  - Performance
  - PHP
  - WordPress
coverAlt: "A row of gadgets laid out on a white surface: Sony headphones, a phone battery, phone cases, and a Fujifilm camera."
originalCover: https://buthonestly.io/wp-content/uploads/2023/12/woocommerce-related-products-recommendations.jpeg
---

In today’s eCommerce world, creating a more relevant shopping experience for each customer is essential.

> [!summary]- Quick Summary
>
> - Default WooCommerce related products rely on categories and tags, which often surface irrelevant or generic recommendations for larger catalogs.
> - Switching to attribute-based related products makes suggestions match what shoppers actually care about, like style, color, or size.
> - The provided PHP snippet filters related products by shared attributes, then backfills with WooCommerce defaults so you still show four items.
> - Correct attribute slugs, visible and linkable attributes, and regular cleanup of attribute data are crucial for good recommendations.
> - Combine attribute-based related products with filters, upsells, cross-sells, ratings, and advanced recommendation plugins to boost discovery, trust, and order value.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

If you have a WooCommerce store, especially one with many products, achieving this can be challenging. The simple related products in WooCommerce often fall short. They can display items that aren’t quite similar to what the customer is visiting.

This is because WooCommerce offers product recommendations based only on the same categories and tags as the displayed product.

However, a better approach can be to use product attributes to filter related products. This strategy not only makes your products more appealing. It also aligns seamlessly with your customers’ interests, creating a more satisfying shopping experience.

## What are WooCommerce Related Products?

Related products in WooCommerce are products similar to the product that the customer is viewing. They are like product recommendations or the popular “frequently bought together” for customers.

Think of when you’re looking at a pair of glasses on an e-commerce store. Some product recommendations might include specific products such as lenses, frames, cloths, or add-ons that go with those glasses.

This is an example of how related products look like for one of my D&D miniatures:

![A set of 4 related products for a D&D miniature item on elementalbeacon.com. The heading reads Other Unpainted Miniatures from This Pack and lists 4 miniatures.](https://i0.wp.com/buthonestly.io/wp-content/uploads/2023/12/related-products-by-attribute-example-1030x368.jpeg?resize=1030%2C368&quality=81&ssl=1)

## The Importance of Product Recommendations

You cannot overstate the importance of product recommendations in an online store. They are important because they show the customer other options in your catalog. They might pique their interest as well, increasing sales.

### How Do WooCommerce Related Products Work?

On default WooCommerce installations, the plugin adds four related products for each product on a single page automatically. As of today, you cannot manually add them, nor can you display related products using a shortcode on a page.

### How Does WooCommerce Determine Related Products?

It displays recommended items from the categories or tags they share.

This selection method might not always be precise, especially for stores with diverse and extensive inventories. Instead, you can suggest products that are more closely related to the customer’s interests. You can use attributes such as color, style, or size.

For example, to increase sales, you can show a customer dress shoes or elegant gloves when they look at a suit.

Using the attribute Style and the term Elegant, you can significantly enhance the relevance of the product recommendations.

## Benefits of Related Products by Attributes

1.  **Increased Customer Engagement**: Tailored recommendations keep customers engaged, encouraging them to explore your store further.
2.  **Higher Conversion Rates**: Relevant product suggestions have a better chance of converting into sales.
3.  **Higher Average Order Value**: Suggesting more relevant items can increase the overall order value.
4.  **Improved Customer Satisfaction**: When customers find what they are looking for easily, it boosts their satisfaction.
5.  **Competitive Edge**: Offering more relevant shopping experiences can set your store apart from competitors who might still rely on generic recommendation algorithms.

![person holding white ipad on brown wooden table](https://i0.wp.com/buthonestly.io/wp-content/uploads/2023/12/pexels-photo-6476589.jpeg?resize=1880%2C1255&quality=81&ssl=1 "Photo by Mikael Blomkvist on Pexels.com")

## WooCommerce Related Products by Attribute

As highlighted in several of my WooCommerce articles, implementing this feature is straightforward with the right code snippet.

With this tailored script, your store will do more than recommend products; it will enhance the entire shopping journey.

You are about to edit PHP. Even a missing semicolon can break your site. Before you make any code changes, have a backup of your site. This will help you restore things if something goes wrong. I recommend using Jetpack Backup for real-time backups and one-click restores.

This script filters related products based on their shared attributes. It offers a more accurate selection than the standard category or tag-based approach built into WooCommerce.

```php
/**
 * @snippet       Get Related Products by Attributes
 * @author        Nicola Mustone
 * @author_url    https://buthonestly.io/programming/improve-woocommerce-related-products-recommendations/
 * @tested-up-to  WooCommerce 10.3.X
 * @license       GPLv2
 */
add_filter( 'woocommerce_related_products', 'nm_related_products_by_attributes', 10, 3 );
function nm_related_products_by_attributes( $related_posts, $product_id, $args ) {
    $product = wc_get_product( $product_id );

	$attributes           = array( 'pa_attribute_1', 'pa_attribute_2', 'pa_attribute_3' );
	$new_related_products = array();

	foreach( $attributes as $attribute ) {
		$terms = $product->get_attribute( $attribute );

		if ( ! empty( $terms ) ) {
			$new_related_products = array_merge( $new_related_products, nm_get_related_products( $product_id, $attribute, $terms ) );
		}
	}

	if ( count( $new_related_products ) < 4 ) {
		$related_posts = array_slice( array_merge( $new_related_products, $related_posts ), 0, 4 );
	} else {
		$related_posts = array_slice( $new_related_products, 0, 4 );
	}

    return $related_posts;
}

function nm_get_related_products( $product_id, $attribute, $terms ) {
	$args = array(
		'post_type'      => 'product',
		'posts_per_page' => 4,
		'post__not_in'   => array( $product_id ),
		'orderby'        => 'rand',
		'tax_query'      => array(
			array(
				'taxonomy' => $attribute,
				'field'    => 'name',
				'terms'    => array_map( 'trim', explode( ',', $terms ) ),
			),
		),
	);

	$query            = new WP_Query( $args );
	$related_products = wp_list_pluck( $query->posts, 'ID' );

    return $related_products;
}
```

The snippet also covers cases with less than four related products by attributes. It can add additional product recommendations determined by WooCommerce on categories and tags. This ensures a consistent display of four items.

## Custom Attribute Slugs

To make this script work perfectly for your store, you need to tailor it to your specific WooCommerce attributes. Use the correct attribute slugs for your shop.

### Finding The Attribute Slug

1.  Log into your WordPress Dashboard at `https://yourdomain.com/wp-admin`.
2.  Go to Products > Attributes in the sidebar to manage product attributes.
3.  On the attributes table, the second column lists the slugs.
4.  Remember, these slugs are not complete. WooCommerce hides the prefix `pa_`. The actual attribute slug looks like `pa_3d_artist`.

![The Products > Attributes table showing where the slug is. The image shows 2 purple arrows pointing at the values in the second column of the table.](https://i0.wp.com/buthonestly.io/wp-content/uploads/2023/12/product-attributes-slug-list.jpeg?resize=1030%2C282&quality=81&ssl=1)

### Using The Attribute Slug

With the slugs in hand, integrate them into the script. On line 12, replace `pa_attribute_1` with the slugs of your chosen attributes. Delete or add more as you need.

## Advanced Tips for WooCommerce Attributes

- **Analyze Customer Data**: Regularly review which attributes your customers are most interested in. This data can help refine your selections for even better recommendations.
- **Update Attributes Regularly**: Keep your product attributes up-to-date to reflect trends and preferences.
- **Experiment with Different Combinations**: Try different combinations of attributes. Sometimes, unusual pairings can lead to unique and appealing product findings.
- **Make your Attributes Visible:** Moving the attributes from the Additional Information tab to a more visible position can help customers see and use them more easily. A popular choice is after the Add to Cart button.
- **Make your Attributes Links**: Linking your attributes to catalog pages can increase the chances of a customer seeing other products. [[make-product-attributes-linkable-woocommerce|I wrote an article about this]].

## Enhancing Product Discovery

Consider implementing these additional features to improve even more product discovery in your WooCommerce store.

### Use WooCommerce Product Filters

You can and should add filters to your store. This simple trick lets customers narrow their choices based on specific attributes like color, size, or brand. Filters improve user experience and help customers find what they’re looking for faster.

To add attribute filters to your online catalog, you can use the [Product Filter block](https://woocommerce.com/document/woocommerce-product-search/blocks/product-filter-attributes/). If you do not have access to it, then use the legacy [Product Filter widget](https://woocommerce.com/document/woocommerce-product-search/widgets/product-filter-attributes/).

### Add Upsells and Cross-Sells Products

Cross-sells and Upsells are recommendations that WooCommerce shows on the product and shopping cart pages.

Upsells are typically products that are more profitable, better quality, or more expensive. Cross-sells, instead, are typically complementary items. For example, if you sell a camera, cross-sells might be a protective case, lenses, etc. They show respectively on the product page and the cart page.

Upsells and cross-sells do not require any additional extension or snippet. You can create them directly in WooCommerce from the Edit Product screen in Product Data > Linked Products.

![The Linked Products screen showing the Upsells and Cross-sells fields in WooCommerce](https://i0.wp.com/buthonestly.io/wp-content/uploads/2023/12/upsells-product-cross-sells-product.jpg?resize=1030%2C288&quality=81&ssl=1)

### Show Customer Ratings

Show the customer rating for your related products. Reviews provide proof and can influence the customer’s decisions. Show products with high ratings as related items to encourage customers to trust you and explore your catalog more.

Also, you can [show customer reviews](https://ahrefs.com/blog/seo-ecommerce-category-pages/#add-reviews) at the end of the catalog pages. This is good not only for the customer but also for SEO.

Unless your theme changes this, WooCommerce already shows the star rating on every list of products.

### Display Custom Product Recommendations

Use customer data to offer tailored product suggestions. Use browsing history, purchase history, and preferences to display product recommendations that match the customer’s behavior and personal preference.

The script in this article, and no other quick snippet, can do this. For this advanced task, there are extensions such as [Product Recommendations](https://woocommerce.com/products/product-recommendations/) or [Recommendation Engine](https://woocommerce.com/products/recommendation-engine/) by the WooCommerce team.

Personalized recommendations based on customer behavior involve more advanced analysis and statistical techniques. A single snippet or a couple of functions will not be able to do it.

![positive senior man in eyeglasses showing thumbs up and looking at camera](https://i0.wp.com/buthonestly.io/wp-content/uploads/2023/12/pexels-photo-3824771.jpeg?resize=1845%2C1300&quality=81&ssl=1 "Photo by Andrea Piacquadio on Pexels.com")

## Embrace the Future of Online Retail

Display related products using attributes in your WooCommerce store and add the other advanced tips mentioned in this article. This approach meets the needs and wants of online shoppers, giving them a good and fast experience.

Remember that the world of eCommerce is constantly changing. Adapt and focus on your customers to ensure that your WooCommerce store continues to thrive.

I look forward to seeing how these changes transform your store and improve customers’ shopping experience.
