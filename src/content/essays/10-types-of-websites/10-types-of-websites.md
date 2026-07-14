---
title: 10 Types of Websites and What I’d Use to Build Them
date: 2025-12-07T02:00:00
sticky: false
cornerstone: false
excerpt: When WordPress is enough, and when a specialized no-code tool actually
  makes more sense for your site.
categories:
  - Web
tags:
  - Blogging
  - Productivity
  - WordPress
  - Workflow
coverAlt: tools for 10 types of sites
originalCover: https://buthonestly.io/wp-content/uploads/2025/11/10-types-of-sites-10-tools.jpg
---

> [!summary]- Quick Summary
>
> - WordPress is my default for most types of websites: blogs, brochure sites, memberships, and courses.
> - For some projects, specialized tools beat WordPress: Listable for directories, wiki.gg for wikis, and Substack for newsletter-first writing.
> - I treat tiny shops, one-page experiments, and simple bookings as “don’t overbuild” cases — Stripe or Calendly plus a simple page.
> - When projects grow (serious shops, complex bookings, site-first memberships), I’m happy to lean on WooCommerce and other WordPress plugins instead of chasing new platforms.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

If you gave me a random website to build tomorrow, I’d probably reach for WordPress. Not because it’s always the “best” tool in some abstract way, but because I know it well enough that I can bend it into almost any of the usual WordPress website types: blog, shop, membership, course, whatever. And because, honestly, I’m a bit lazy. If I can ship something solid with tools I already understand, I’ll do that.

But that raises a better question:

If I _could_ do everything with WordPress… are there cases where a more specialized tool would actually be nicer?

That’s what this essay is about: ten **types of websites** and the specific tools I’d reach for. WordPress is still my default, but there are some exceptions.

## “Normal” Websites and Blogs

![WordPress .com vs .org](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/wordpress-com-vs-org.jpg?resize=830%2C415&quality=81&ssl=1 "Image by Automattic.")

For anything that looks like a normal website — home page, a few subpages, maybe a blog — I still don’t overthink it. I use WordPress.

I like that it’s mature. Not only that, but I like that it’s been around long enough to prove it’s not going anywhere. That usually means the things I build on it will still be alive in a few years too.

These days I’d pick a **Full Site Editing (FSE)** theme and do everything in the block editor: header, footer, templates, blog index, and typography. I would rather not edit PHP files anymore. I want to design the structure once, set some sensible defaults, and then focus on content.

If you told me, “I just need a site for my thing,” I wouldn’t send you shopping for website builders. I’d set you up on WordPress, write a few pages with you, and ship it.

Specialized tools don’t really beat WordPress here. They mostly move the same boxes around with different names.

I know very well about the battle of .org vs. .com. I’d personally prefer [WordPress.com](https://wordpress.com "WordPress.com"). I never had bad experiences; sites on any plan run very fast, and I don’t have to worry about backups and updates.

## Tiny Shops and Serious Shops

![Stripe](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/stripe.jpg?resize=830%2C361&quality=81&ssl=1)

When it comes to taking money online, I think in two sizes: **tiny** and **serious**.

If all you require is a way for people to pay you for one thing — a donation, a single product, or maybe a “pay what you want” experiment — I wouldn’t build a full store. That’s like buying an industrial fridge for two yogurts.

Instead I’d use **Stripe payment pages** (Payment Links) or, on WordPress.com, the **Payments block**. You create a product in Stripe, get a checkout link, and either send that to people directly or tuck it behind a button on your site. No carts, no catalogs, no “add to cart,” just “Here’s the button, click, and pay.”

As soon as you want an **actual store** — multiple products, shipping, order management, maybe taxes or stock — the story changes. Then I’d go to **WooCommerce** on top of WordPress.

Is WooCommerce perfect? No. Does it solve 90% of small-shop problems without code and let you grow over time? Yes. I’d rather live with its quirks than stitch together three different niche tools that might be gone in two years.

So my rule of thumb is simple:

- One or two things to sell? [Stripe page](https://stripe.com/en-ro/payments/payment-links) or [WordPress.com Payments](https://wordpress.com/support/wordpress-editor/blocks/payments/accept-payments/).
- Actual shop? WordPress + [WooCommerce](https://woocommerce.com/).

## Directories: Lists of Things with Filters

![Listable](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/listable.jpg?resize=830%2C467&quality=81&ssl=1)

Directories are the first place where I start to feel the limits of “I’ll just do it in WordPress.”

You _can_ build a directory in WordPress. I’ve seen it. Custom post types, custom fields, search plugins, filtering plugins, and some glue in between. It works… until it doesn’t. At some point you end up debugging why the filter doesn’t like that one field you added six months ago.

If I wanted to build a directory today — a list of tools, local businesses, communities, jobs — I’d rather use [Listable](https://get-listable.com/).

The whole point of Listable is: “this is a directory.” You define what a listing is, what fields it has, and how it’s categorized. It handles the layout, the cards, the search, the filtering. You stay in a browser UI instead of a plugin graveyard.

If the directory is part of a bigger project, I’d happily run the marketing site on WordPress and the actual directory on Listable. If the directory _is_ the project, I might not even bother with WordPress at all.

## Wikis Without Handing Your Work to an Ad Farm

![Wiki.gg](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/wikigg.jpg?resize=830%2C198&quality=81&ssl=1)

Wikis are another place where “just use WordPress” starts to feel wrong.

A good wiki is a shared brain: pages linking into each other, a clear history of edits, templates, categories. It’s meant to grow and change, not be a static “docs” page you update twice a year.

If I wanted to build a wiki today, especially for a game or a niche topic, I’d go with [wiki.gg](https://www.wiki.gg/).

There are big platforms out there that will happily host your free wiki. You’ve probably landed on them from search results: you scroll, you dodge three pop-ups, the page jumps as another ad loads, and when you tap something on mobile you’re not entirely sure if you clicked a link or an ad. They also tend to treat the content as _theirs_ once it’s on there, and taking anything down is… optimistic.

I don’t love that model. I don’t like pouring effort into something that’s then wrapped in someone else’s aggressive ad strategy and controlled like their asset, not yours.

With wiki.gg, you still get the familiar wiki structure — history, categories, templates, collaborative editing — but without feeling like you just handed your project to an ad network with a sidebar.

I’d keep the glossy front page on WordPress if I needed it and use wiki.gg as the brain where the real knowledge lives.

P.S. If you want to avoid those ad-aggregating wikis, there’s a [tiny browser extension](https://getindie.wiki/) that can help you.

## One-Page Experiments

When I’m not sure if an idea is worth the effort, I try very hard not to build a “full” website.

What I actually need is one honest page:

- This is what I’m offering.
- This is who it’s for.
- Here’s what to do if you’re interested.

For that, I stay in my comfort zone: I open WordPress, create a single page, design it with the block editor, and treat everything else as optional. No huge navigation, no “About” page. Just the one page and maybe a simple thank-you page after a form or payment.

If I’m charging for something, I might not even handle the payment on the site. I’ll explain the offer, then send people straight to a Stripe payment page. The “website” part is just context around the buy button.

## Portfolios and Personal Sites

Portfolios are where people often overcomplicate things.

You don’t need a headless CMS and three front-end frameworks to show a few projects and an email address. You need a place where people can understand what you do, see some proof, and contact you.

For that, I again use WordPress, but I strip it down aggressively:

- A home page that explains who I am and what I do.
- A “Work” or “Projects” page with a simple grid.
- Individual project pages with some screenshots and a short story.
- A contact page or just a clear email on every page.

Specialized portfolio tools exist, but they mostly give you what WordPress already can: pages, images, links. I’d rather stay with the thing I know and spend energy on the work, not the platform.

If you’re a developer, you might also just want to use a [fancy profile repository](https://docs.github.com/en/account-and-profile/how-tos/profile-customization/managing-your-profile-readme) on your GitHub account.

## Memberships and Newsletter-First Sites

![Substack](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/substack.jpg?resize=830%2C307&quality=81&ssl=1)

Membership is where WordPress starts to stretch its legs.

If I want a classic membership site — some public content, some protected content, logged-in members, maybe a small community area — I’m very comfortable staying in the WordPress world:

- WordPress for the content and structure.
- WooCommerce or Payment blocks (on WordPress.com) for payments.
- A membership plugin or Paid Content (on WordPress.com) to decide who gets access to what.

Everything lives on my domain, under my control. I like that. It feels long-term.

But if the project is **email-first**, I start to look elsewhere. If the main experience is:

- You subscribe with email.
- You read everything in your inbox.
- The website is just an archive.

…then I’d seriously consider [Substack](https://substack.com/).

If I wanted to write regularly, build an audience through email, and maybe add paid subscribers later, I wouldn’t be in a huge rush to recreate all of that in WordPress. Substack is built exactly for that use case. It’s not perfect, but it’s very straightforward.

So my split here is:

- Site-first memberships → **WordPress + memberships**.
- Newsletter-first projects → **Substack**.

## Courses

![SenseiLMS](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/senseilms.jpg?resize=830%2C509&quality=81&ssl=1)

Courses are just structured content that people pay for, with a few extra expectations: progress, modules, and maybe quizzes.

If I were to run a course on my own site today, I’d start from WordPress again and layer on top:

- [Sensei](https://senseilms.com/) is the one I’d look at first, especially if I’m already in the WooCommerce / Automattic world. It plugs nicely into that ecosystem and gives you lessons, modules, and basic course logic.
- [LearnDash](https://www.learndash.com/) is another big name in WordPress courses. I haven’t personally used it, but it’s popular enough that if someone told me, “We run our whole course business on LearnDash,” I wouldn’t be surprised.

Either way, the pattern is the same: WordPress holds the content and pages, and the course plugin adds structure.

Could you host courses elsewhere and just use WordPress for the sales page? Absolutely. But if I already have a solid WordPress setup, my instinct is to keep it all in one place rather than scattering lessons across three different platforms.

## Community Sites

For communities, I’m much less interested in making WordPress itself do the heavy lifting.

If the whole point is people talking to each other — threads, chat, replies — I’d rather use something built for that: [Discord](https://discord.com/), [Slack](https://slack.com/), or even a WhatsApp groups, whatever makes sense for the audience.

Yes, there are WordPress forum plugins. If I really wanted a traditional forum, I’d look at [bbPress](https://bbpress.org/). But in most real-life setups, people already live in Discord and Slack. I don’t need to force them into a forum just because it fits nicer in my plugin list. Plus forums feel old school.

## Bookings and Appointments

![WooCommerce](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/woo.jpg?resize=830%2C434&quality=81&ssl=1)

Finally, bookings.

If all you need is a simple “book a call with me” flow, I wouldn’t build any of it myself. I’d use [Calendly](https://calendly.com/).

My default here would be:

- A simple site on WordPress.com with a “Book a call” page.
- A Calendly block (available on the Premium plan).
- That’s it.

Calendly handles time zones, availability, reminders, and cancellations. WordPress gives you a pleasant place to explain what the call is about and who it’s for.

When bookings get more complex — multiple services, paid sessions, specific time rules, resources, maybe a team — then I’d upgrade the stack:

- WordPress.
- WooCommerce.
- [WooCommerce Bookings](https://woocommerce.com/products/woocommerce-bookings/) to turn time slots into bookable products that people pay for.

## Where Specialized Tools Make More Sense

I could force almost all of these use cases into WordPress and call it a day. In some projects, I still might, just to keep things familiar.

But for specialized projects, you require specialized tools. WordPress is not always the answer, no matter how much you love it.
