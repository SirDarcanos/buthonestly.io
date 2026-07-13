---
title: Make Product Attributes Linkable in WooCommerce
date: 2016-03-11T10:38:43
updated: 2025-11-20T20:09:42
draft: false
excerpt: Use product attributes as real links, not dead labels, so WooCommerce
  can guide customers instead of listing facts.
categories:
  - Programming
tags:
  - Performance
  - PHP
  - WordPress
coverAlt: Make Product Attributes Linkable
coverCaption: Photo by Mica Asato on Pexels.com
originalCover: https://buthonestly.io/wp-content/uploads/2016/03/pexels-photo-1082529.jpeg
---

Product attributes are wasted potential if they cannot take your customers anywhere.

> [!summary]- Quick Summary
>
> -   Product attributes are wasted potential if they cannot take customers anywhere.
> -   This snippet shows how to make product attributes linkable in WooCommerce without changing your workflow.
> -   Global attributes get optional URLs and new tab toggles on their term screens.
> -   Local attributes can use simple Markdown-style links that render as clickable values in the Additional Information tab.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

Most WooCommerce stores treat attributes as static facts. Size: Medium. Color: Blue. Brand: Whatever. Useful, but passive.

In practice, attributes often point to something richer. A size guide. A fit explanation. A brand story. If the attribute already hints at that context, it makes sense to let customers click through to it.

This is what this snippet does: it turns product attributes into links, without changing how you manage products day to day.

## What Product Attributes Actually Are

If you are not clear on how WooCommerce product attributes work, everything else in this snippet will feel confusing.

WooCommerce uses two main kinds of attributes:

-   Global attributes
-   Local (per-product) attributes

You can read about them in the [WooCommerce documentation](https://woocommerce.com/document/managing-product-taxonomies/#section-3), but here is the short version.

Global attributes are taxonomies. You create them under **Products → Attributes**. They behave like product categories or post tags and can be reused across many products.

Local attributes live only on a single product. You add them in the **Attributes** tab while editing that product. They are not shared with other products and are not taxonomies.

This distinction matters because the code has to handle them in different ways.

I wrote an essay about [[woocommerce-attributes-vs-variations|WooCommerce attributes vs variations]] if you want a deeper refresher on the subject.

## Why Make Attributes Linkable

Out of the box, WooCommerce shows attributes as plain text. That works, but it leaves a lot of potential unused.

Turning attributes into links helps in a few ways:

-   Customers can jump to useful context, like a size chart or a care guide.
-   You can point attributes to documentation or support pages instead of repeating the same text.
-   You keep product pages cleaner while still offering depth where it matters.
-   Search engines get another way to discover and connect important pages on your site.

None of this is magic. It is just a small way to make the product page feel more intentional.

## Making Product Attributes Linkable

Because global and local attributes work differently, the code has to treat them differently.

At a high level, my custom solution does two things:

1.  For global attributes, it adds two new term meta fields:
    -   A URL to link the attribute term to
    -   A checkbox to open the link in a new tab
2.  For local attributes, it lets you write attribute values using a small piece of Markdown:
    -   `[Text](https://example.com)`
    -   Or `[Text](https://example.com){blank}` if you want a new tab

On the front end, the snippet filters how WooCommerce prints attributes in the **Additional Information** tab on the single product page.  
If a URL is set or Markdown is present, it outputs a proper `<a>` tag.  
If not, it falls back to showing the plain attribute text.

The code below is a self-contained way to link WooCommerce attributes from the **Additional Information** tab without changing how you add products.

You are about to edit PHP. Even a missing semicolon can break your site. Before you make any code changes, have a backup of your site. This will help you restore things if something goes wrong. I recommend using Jetpack Backup for real-time backups and one-click restores.

/\*\*
 \* @snippet       Make Product Attributes Linkable + Optional New Tab
 \* @author        Nicola Mustone
 \* @author\_url    https://buthonestly.io/programming/make-product-attributes-linkable-woocommerce/
 \* @tested-up-to  WooCommerce 10.3.X
 \* @license       GPLv2
 \*/

/\*\*
 \* Register term fields for WooCommerce attributes.
 \*/
add\_action( 'woocommerce\_after\_register\_taxonomy', 'bh\_register\_attributes\_url\_meta' );
function bh\_register\_attributes\_url\_meta() {
	if ( ! is\_admin() ) {
		return;
	}

	$attributes = wc\_get\_attribute\_taxonomies();
	if ( empty( $attributes ) ) {
		return;
	}

	foreach ( $attributes as $tax ) {
		$name = wc\_attribute\_taxonomy\_name( $tax->attribute\_name );

		add\_action( "{$name}\_add\_form\_fields", 'bh\_add\_attribute\_url\_meta\_field' );
		add\_action( "{$name}\_edit\_form\_fields", 'bh\_edit\_attribute\_url\_meta\_field', 10 );
		add\_action( "edited\_{$name}", 'bh\_save\_attribute\_url' );
		add\_action( "create\_{$name}", 'bh\_save\_attribute\_url' );
	}
}

/\*\*
 \* Add URL + checkbox field to the new attribute term form.
 \*/
function bh\_add\_attribute\_url\_meta\_field() {
	wp\_nonce\_field( basename( \_\_FILE\_\_ ), 'attribute\_url\_meta\_nonce' );
	?>
	<div class="form-field">
		<label for="attribute\_url"><?php esc\_html\_e( 'URL', 'woocommerce' ); ?></label>
		<input type="url" name="attribute\_url" id="attribute\_url" value="" class="regular-text" />
		<p class="description"><?php esc\_html\_e( 'Optional. If set, the attribute value will link to this URL.', 'woocommerce' ); ?></p>
	</div>

	<div class="form-field">
		<label for="attribute\_url\_blank">
			<input type="checkbox" name="attribute\_url\_blank" id="attribute\_url\_blank" value="1" />
			<?php esc\_html\_e( 'Open in a new tab', 'woocommerce' ); ?>
		</label>
	</div>
	<?php
}

/\*\*
 \* Add URL + checkbox field to the edit attribute term form.
 \*/
function bh\_edit\_attribute\_url\_meta\_field( $term ) {
	$url   = get\_term\_meta( $term->term\_id, 'attribute\_url', true );
	$blank = get\_term\_meta( $term->term\_id, 'attribute\_url\_blank', true );
	wp\_nonce\_field( basename( \_\_FILE\_\_ ), 'attribute\_url\_meta\_nonce' );
	?>
	<tr class="form-field">
		<th scope="row" valign="top">
			<label for="attribute\_url"><?php esc\_html\_e( 'URL', 'woocommerce' ); ?></label>
		</th>
		<td>
			<input type="url" name="attribute\_url" id="attribute\_url" value="<?php echo esc\_url( $url ); ?>" class="regular-text" />
			<p class="description"><?php esc\_html\_e( 'Optional. If set, the attribute value will link to this URL.', 'woocommerce' ); ?></p>
		</td>
	</tr>
	<tr class="form-field">
		<th scope="row" valign="top">
			<label for="attribute\_url\_blank"><?php esc\_html\_e( 'Open in a new tab', 'woocommerce' ); ?></label>
		</th>
		<td>
			<input type="checkbox" name="attribute\_url\_blank" id="attribute\_url\_blank" value="1" <?php checked( $blank, '1' ); ?> />
		</td>
	</tr>
	<?php
}

/\*\*
 \* Save URL + checkbox field for attribute terms.
 \*/
function bh\_save\_attribute\_url( $term\_id ) {
	if ( ! isset( $\_POST\['attribute\_url\_meta\_nonce'\] ) ||
		 ! wp\_verify\_nonce( $\_POST\['attribute\_url\_meta\_nonce'\], basename( \_\_FILE\_\_ ) ) ) {
		return;
	}

	if ( ! current\_user\_can( 'manage\_product\_terms' ) ) {
		return;
	}

	$new\_url   = isset( $\_POST\['attribute\_url'\] ) ? esc\_url\_raw( wp\_unslash( $\_POST\['attribute\_url'\] ) ) : '';
	$new\_blank = isset( $\_POST\['attribute\_url\_blank'\] ) ? '1' : '0';

	if ( '' === $new\_url ) {
		delete\_term\_meta( $term\_id, 'attribute\_url' );
		delete\_term\_meta( $term\_id, 'attribute\_url\_blank' );
	} else {
		update\_term\_meta( $term\_id, 'attribute\_url', $new\_url );
		update\_term\_meta( $term\_id, 'attribute\_url\_blank', $new\_blank );
	}
}

/\*\*
 \* Filter to make product attributes linkable.
 \*/
add\_filter( 'woocommerce\_attribute', 'bh\_make\_product\_atts\_linkable', 10, 3 );
function bh\_make\_product\_atts\_linkable( $text, $attribute, $values ) {
	$new\_values = array();

	foreach ( (array) $values as $value ) {
		if ( $attribute\['is\_taxonomy'\] ) {
			// Handle global (taxonomy) attributes.
			$term = get\_term\_by( 'slug', sanitize\_title( $value ), $attribute\['name'\] );
			if ( ! $term || is\_wp\_error( $term ) ) {
				// Fallback to name if needed.
				$term = get\_term\_by( 'name', $value, $attribute\['name'\] );
			}

			if ( $term && ! is\_wp\_error( $term ) ) {
				$url = get\_term\_meta( $term->term\_id, 'attribute\_url', true );
				if ( ! empty( $url ) ) {
					$blank = get\_term\_meta( $term->term\_id, 'attribute\_url\_blank', true );
					$target\_attr = ( '1' === $blank ) ? ' target="\_blank"' : '';

					$new\_values\[\] = sprintf(
						'<a href="%s" title="%s"%s>%s</a>',
						esc\_url( $url ),
						esc\_attr( $term->name ),
						$target\_attr,
						esc\_html( $term->name )
					);
					continue;
				}
			}

			$new\_values\[\] = esc\_html( $value );
		} else {
			// Handle local attributes (Markdown-style \[text\](url)).
			if ( preg\_match( '/\[(.\*?)\]((.\*?))(?:{(blank)})?/', $value, $matches ) ) {
				$link\_text = esc\_html( $matches\[1\] );
				$link\_url  = strip\_tags( $matches\[2\] );
				$target    = isset( $matches\[3\] ) && $matches\[3\] === 'blank' ? ' target="\_blank"' : '';

				if ( filter\_var( $link\_url, FILTER\_VALIDATE\_URL ) ) {
					$new\_values\[\] = sprintf(
						'<a href="%s"%s>%s</a>',
						esc\_url( $link\_url ),
						$target,
						$link\_text
					);
				} else {
					$new\_values\[\] = $link\_text;
				}
			}

		}
	}

	// Fallback to original text if nothing changed.
	return $new\_values ? implode( ', ', $new\_values ) : $text;
}

From the start of the snippet to around the middle, the code registers and saves the extra fields for global attributes.  
From the middle to the end, it changes how attributes are rendered so they can become links for both global and local attributes.

## Adding Links To Global Attributes

For global attributes, everything happens where you already manage their terms.

1.  Go to **Products → Attributes**.
2.  Either create a new attribute or edit an existing one.
3.  In the table on the right, click the cog icon to manage terms for that attribute.

You will see the usual form to add or edit terms, plus a new field at the bottom named **URL** and a checkbox to **open the link in a new tab**.

![The Edit attribute term form shows the Name, Slug and Description text fields, followed by a new URL field added by the snippet from this article.](https://i0.wp.com/buthonestly.io/wp-content/uploads/2016/03/edit-linkable-attribute.jpg?resize=552%2C430&quality=81&ssl=1)

Type the link you want that attribute term to point to. For example:

-   A brand term pointing to a brand story page
-   A material term pointing to a care instructions page
-   A size term pointing to a size guide

If you want the link to open in a new tab, tick the checkbox.  
If you leave the URL field empty, the attribute behaves as before and shows as plain text.

The important part is that you do not need to change how you assign attributes to products. You still pick terms the same way. The link behavior is handled by the snippet.

## Adding Links To Local Attributes With Markdown

Local attributes do not have a shared interface for extra fields.  
There is no term screen, no meta box, nothing.

To work around this, the snippet lets you use a simple Markdown-style syntax in the attribute value. If you like Markdown already, this will feel familiar. If not, you only have to remember one pattern and [[write-in-markdown|read my essay on why I like it]]. Maybe I can change your mind.

1.  Edit a product in **Products → All Products**.
2.  Open the **Attributes** tab.
3.  Add a new **Custom product attribute**.
4.  Give it a name.
5.  In the **Values** field, write your links using this format:

\[Text shown\](https://myurl.com)

The second attribute in the screenshot example (named “Test”) is a local attribute that uses this pattern.

![The attributes form in WooCommerce showing the markdown value of an attribute](https://i0.wp.com/buthonestly.io/wp-content/uploads/2023/11/markdown-attributes.jpg?resize=1030%2C524&quality=81&ssl=1)

After you click **Save Attributes** and update the product, the **Additional Information** tab on the product page will show the attribute name, and the value will be a clickable link with the text you wrote between the square brackets.

![The Additional Information tab on WooCommerce showing the local and global attributes as links.](https://i0.wp.com/buthonestly.io/wp-content/uploads/2023/11/frontend-markdown-attribute.jpg?resize=880%2C404&quality=81&ssl=1)

To open the link in a new tab, add `{blank}` right after the link:

\[Text shown\](https://myurl.com){blank}

The snippet looks for that `{blank}` marker and sets the `target="_blank"` attribute on the link. If the URL is invalid, the code falls back to showing only the text.

There is one important limitation:

**Do not use this Markdown trick for local attributes that are “Used for variations”.**

The script is not meant to handle that case. Use it only for attributes that are displayed on the product page but not used to build variations.

## When Linkable Attributes Help

This approach is most useful when clickable product attributes hint at extra context instead of acting as pure filters.

Some examples:

-   “Organic cotton” linking to a page about sourcing and certifications.
-   “Lifetime warranty” linking to a clear, human warranty page.
-   “Digital download” linking to a how-to guide for accessing purchases.
-   “Pre-order” linking to an explanation of timelines and expectations.

You keep the product page lean while still letting the customer dig deeper if they care.

It also helps for internal consistency. If you often paste the same important links into different product descriptions, linking attributes can centralize that logic.

You set the link once on the term and every product using that term benefits.

## Limitations And Tradeoffs

Like most customizations, this one is not perfect everywhere.

Some things to keep in mind:

-   The snippet focuses on the Additional Information tab in the single product page. If your theme overrides how attributes are displayed, you might need to adjust the filter or the markup.
-   This is not meant for attributes used for variations.  
    Those need to stay clean, simple, and stable for WooCommerce to work correctly.
-   Every link is an invitation to leave the product page.  
    In some cases this is useful, but it still adds a small decision for the customer. It is worth being intentional about which attributes get links.

The goal is not to link every attribute. It is to link the few attributes that benefit from extra context.

## Making Attributes Part Of The Experience

Product attributes often feel like a backend detail.  
You fill them in because WooCommerce asks for them, not because you see them as part of the customer journey.

Turning them into links shifts that mindset. They become small, structured entry points into your documentation, your support content, and your brand.

You are already doing the work of defining and assigning attributes.  
With a bit of code and a tiny habit change, those attributes can start pulling their weight instead of sitting there as static labels.
