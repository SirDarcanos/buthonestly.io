---
title: "WooCommerce CLI Product Management: A Practical Guide"
date: 2016-03-10T12:44:32
updated: 2025-11-18T07:43:41
draft: false
excerpt: Manage WooCommerce products from the terminal, including variable
  products and bulk changes, with clear, scriptable CLI commands.
categories:
  - Web
tags:
  - Performance
  - Productivity
  - WordPress
  - Workflow
coverAlt: Pexels photo
coverCaption: Photo by Markus Spiske on Pexels.com
originalCover: https://buthonestly.io/wp-content/uploads/2016/03/pexels-photo-1089438.jpeg
---

Everything you can do in the WooCommerce product editor, you can handle with WooCommerce CLI product management directly in your terminal.

> [!summary]- Quick Summary
>
> -   WooCommerce CLI product management lets you handle products from the terminal with repeatable, scriptable commands.
> -   You can create simple, external, grouped, and variable products, including attributes and variations defined as arrays.
> -   Deleting, updating, and bulk operations become single commands instead of long sessions in the product editor.
> -   For heavy catalogs or frequent changes, the CLI turns product management into a reliable workflow instead of manual busywork.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

Clicking through the product editor is fine when you have ten products. It turns into a slog when you have hundreds. Or when you need to make the same change across the entire catalog.

WooCommerce CLI, built on top of [WP-CLI](https://wp-cli.org/), lets you manage products without leaving the terminal. No loading spinners. No mouse. Just clear, repeatable commands you can script and automate.

This guide walks through the basics of creating, updating, and deleting products with WooCommerce CLI, including variable products and bulk operations.

## What You Can Do With WooCommerce CLI

With WooCommerce CLI, you can:

-   Create products
-   Import products from a file
-   Update existing products
-   Delete products
-   Get a single product
-   List all products
-   Get registered product types
-   Get product categories

For the full list of commands and options, refer to the [official WooCommerce CLI documentation](https://developer.woocommerce.com/docs/wc-cli/cli-overview/), which is updated as WooCommerce evolves.

Here I will focus on practical examples that are either missing from the docs or easy to get wrong in practice, like variable products and bulk operations.

In the examples below, I split the command on multiple lines by using the that you see at the end of each line. This makes it simpler to read on the site. You can skip that and write the command on a single line, if you prefer to do so.

## Creating WooCommerce Products from the Terminal

You can create every default WooCommerce product type that exists in the editor:

-   Simple
-   External
-   Grouped
-   Variable

You can do it one product at a time, or drive everything from a CSV or text file when you want to scale it up.

### Simple Products

Creating a simple product is a good baseline. This command creates a simple product with the title “Test Product,” SKU `WCCLITESTP`, and a regular price of 20:

wp wc product create 
  --title="Test Product" 
  --type=simple 
  --sku=WCCLITESTP 
  --regular\_price=20

Run it and you will see the new product appear in your WooCommerce dashboard, just as if you had created it through the editor.

### External Products

External products work the same way as simple products, but they point to a URL instead of a local add to cart action.

On top of the simple product fields, you can set a product URL and the button text:

wp wc product create 
  --title="External Product Test" 
  --type=external 
  --sku=WCCLIEXTERNAL 
  --regular\_price=20 
  --product\_url="https://domain.com/product/test/" 
  --button\_text="Buy me"

The URL and button text are technically optional, but in practice you should set at least the `--product_url`. If you forget it here, you will have to edit the product by hand later, which defeats the purpose of using the CLI.

### Grouped Products

A grouped product is a container for other simple products. You create the grouped product first, then assign child products to it.

Create the grouped product:

wp wc product create 
  --title="Grouped Product" 
  --type=grouped 
  --sku=WCCLITESTGROUPED

The command will print the new product ID. You will need that ID when you attach simple products.

When you create a simple product that belongs to this group, pass the grouped product ID as the parent:

wp wc product create 
  --title="Grouped Child Product" 
  --type=simple 
  --sku=WCCLIGROUPEDCHILD 
  --regular\_price=15 
  --parent\_id=123

Replace `123` with the ID of your grouped product. Any simple product created with that `--parent_id` will appear inside the group in WooCommerce.

### Variable Products

Variable products are where WooCommerce CLI gets interesting. Handling attributes and variations from the terminal is where many store owners first feel the payoff of WooCommerce variable products CLI workflows.

Variable products combine attributes (like Color or Size) with multiple variations, each with its own price and settings. Understanding the difference between attributes and variations can take a moment, so [[woocommerce-attributes-vs-variations|I wrote a detailed essay about it]].

WooCommerce CLI treats attributes and variations as arrays. You refer to each one by its index in that array. Indexes start at 0, not 1.

For example, to set the regular price for the first variation, you use:

\--variations.0.regular\_price=20

The same pattern applies to attributes:

\--attributes.0.name="Color"

Let us create a simple variable product with two attributes, Color and Size, and a set of variations that combine them.

wp wc product create 
  --title="Variable Product Test" 
  --type=variable 
  
  --attributes.0.name="Color" 
  --attributes.0.visible=yes 
  --attributes.0.variation=yes 
  --attributes.0.options="Black|Blue" 
  
  --attributes.1.name="Size" 
  --attributes.1.visible=yes 
  --attributes.1.variation=yes 
  --attributes.1.options="Small|Medium" 
  
  --variations.0.attributes.color="Black" 
  --variations.0.attributes.size="Small" 
  --variations.0.regular\_price=20 
  
  --variations.1.attributes.color="Black" 
  --variations.1.attributes.size="Medium" 
  --variations.1.regular\_price=20 
  
  --variations.2.attributes.color="Blue" 
  --variations.2.attributes.size="Small" 
  --variations.2.regular\_price=20 
  
  --variations.3.attributes.color="Blue" 
  --variations.3.attributes.size="Medium" 
  --variations.3.regular\_price=20

Let us unpack what this does.

The first part creates the variable product itself:

wp wc product create 
  --title="Variable Product Test" 
  --type=variable

The next block defines the attributes:

\--attributes.0.name="Color" 
--attributes.0.visible=yes 
--attributes.0.variation=yes 
--attributes.0.options="Black|Blue" 

--attributes.1.name="Size" 
--attributes.1.visible=yes 
--attributes.1.variation=yes 
--attributes.1.options="Small|Medium"

Here:

-   `attributes.0` is the first attribute, Color, with options Black and Blue.
-   `attributes.1` is the second attribute, Size, with options Small and Medium.
-   `visible=yes` makes the attribute visible on the product page.
-   `variation=yes` tells WooCommerce to use that attribute for variations.

The final block creates the variations:

\--variations.0.attributes.color="Black" 
--variations.0.attributes.size="Small" 
--variations.0.regular\_price=20 

--variations.1.attributes.color="Black" 
--variations.1.attributes.size="Medium" 
--variations.1.regular\_price=20 

--variations.2.attributes.color="Blue" 
--variations.2.attributes.size="Small" 
--variations.2.regular\_price=20 

--variations.3.attributes.color="Blue" 
--variations.3.attributes.size="Medium" 
--variations.3.regular\_price=20

Each `variations.N` entry describes one specific combination of attributes and its price.

Two important rules to remember:

-   Indexes start at 0. Your first attribute or variation is `0`, not `1`.
-   Keep attribute names consistent. If you use `color` in one place and `Color` in another, things will break in surprising ways.

If you need more combinations, you keep adding more `variations.N` blocks.

## Deleting WooCommerce Products

Deleting a single product by ID is straightforward:

wp wc product delete 123

Replace `123` with the product ID.

If you want to delete all products in bulk, you can pipe the output of a list command into delete. This is destructive, so use it only when you are sure you want a clean slate.

wp wc product delete $(wp wc product list --format=ids)

`wp wc product list --format=ids` returns only product IDs, one after another. The outer command then deletes each of those IDs.

## Updating WooCommerce Products

Updating a product looks very similar to creating one. Instead of `product create`, you use `product update` and pass the product ID.

wp wc product update 123 
  --regular\_price=25 
  --sale\_price=20

This updates product `123` with a new regular price and sale price. You can pass any other fields you would normally use for creation.

Variations behave the same way. Each variation has its own ID and can be updated like a product:

wp wc product update 456 
  --regular\_price=18

Here `456` is the variation ID. Treat variations as first class products when you update them.

## Bulk Importing WooCommerce Products with CLI

Creating products one by one quickly becomes tedious. The real power of WooCommerce CLI product management shows up when you combine it with files and scripts for bulk imports.

One practical approach is:

1.  Keep your products in a CSV or text file.
2.  Use a script or a tool like Alfred to loop through that file.
3.  For each line, call `wp wc product create` with the right flags.

Remi Corson, a former colleague of mine at Automattic, has a detailed walkthrough of this pattern in his article on [bulk importing WooCommerce products with WP-CLI and Alfred](https://www.remicorson.com/articles/2016/01/bulk-import-woocommerce-products-with-wp-cli-the-and-alfred). It is a good reference if you are comfortable with scripts and want to turn product management into a repeatable workflow instead of a manual chore.

### Example: Bulk Import Simple Products With Python And CSV

Here is a minimal, end to end example of importing simple products from a CSV file using Python and WooCommerce CLI.

First, define a CSV file named `products.csv`. You can create one using Microsoft Excel or Google Sheets. Below is a basic example:

title,sku,regular\_price,type
T Shirt Black Small,TSHIRT-BLACK-S,19.90,simple
T Shirt Black Medium,TSHIRT-BLACK-M,19.90,simple
Mug White,MUG-WHITE,9.90,simple

Each row describes one product:

-   `title` is the product title.
-   `sku` is the SKU.
-   `regular_price` is the price as a number or string.
-   `type` is the WooCommerce product type, here always `simple`.

Next, create a Python script named `import_products.py` in the same directory:

import csv
import subprocess
from pathlib import Path

csv\_path = Path("products.csv")

with csv\_path.open(newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)

    for row in reader:
        title = row\["title"\]
        sku = row\["sku"\]
        regular\_price = row\["regular\_price"\]
        ptype = row.get("type", "simple")

        cmd = \[
            "wp", "wc", "product", "create",
            f'--title={title}',
            f'--type={ptype}',
            f'--sku={sku}',
            f'--regular\_price={regular\_price}',
        \]

        print("Creating product:", title)
        subprocess.run(cmd, check=True)

What this script does:

-   Reads `products.csv` line by line.
-   Builds a `wp wc product create` command for each row.
-   Calls the command with `subprocess.run`, so each product is created through WooCommerce CLI.

To run the import, go to your WordPress project directory (where `wp` is available) and run:

python3 import\_products.py

As long as the `wp wc` commands work when you type them by hand, they will work from Python too. The script just automates the typing.

You can extend this pattern:

-   Add more CSV columns for things like `sale_price`, `description`, or `categories`.
-   Branch on `type` to handle external or variable products differently.
-   Wrap the call in `try`/`except` to log errors without stopping the entire import.

The key idea is simple. The CSV is your source of truth, Python is the glue, and WooCommerce CLI is the interface to your store.

## Why Use WooCommerce CLI At All

Working through the terminal is not for everyone. The product editor is still fine for small sites or rare changes.

The CLI starts to pay off when:

-   You manage many products.
-   You repeat the same changes often.
-   You want a clear history of what changed and when.
-   You want something you can automate or put in version control.

A single command can create an entire variable product with all its variations. Another command can clear a test catalog or update prices across a category. Once you trust the pattern, you save time every time you run it.

The main trade-off is learning the syntax and being careful with destructive commands. Scripts do not ask for confirmation unless you tell them to. A mistake in a bulk delete hurts more than a wrong click in the editor.

If you are willing to invest a bit of practice, WooCommerce CLI gives you a fast, scriptable layer over your store.
