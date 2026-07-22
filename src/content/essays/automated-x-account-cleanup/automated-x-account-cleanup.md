---
title: How I Automated My X Account Cleanup
date: 2025-11-02T02:00:00
updated: 2025-11-27T15:43:22
sticky: false
cornerstone: false
excerpt: Automating my X cleanup let me delete years of noisy posts while keeping the human conversations that still matter.
categories:
  - Programming
tags:
  - Automation
  - Creativity
  - Productivity
coverAlt: A dense 3D pile of blue verified-checkmark badges, one glowing brightly at the centre.
cover: automated-x-account-cleanup.jpg
audioVoice: Enceladus
audioStyle: reflective
audioPace: conversational
---

> [!summary]- Quick Summary
>
> - Revisiting my old X account felt like digital archaeology: broken links, auto-retweets, and half-thoughts from a different version of me.
> - I chose a middle path: delete the automated noise and dead links while preserving conversations and posts that still tell my story.
> - Manual cleanup quickly hit a wall because X only allows one-by-one deletions and the API has strict rate limits.
> - Third-party bulk delete tools help, but they require deep account access, so I preferred a local solution inside my own browser.
> - A customized JavaScript snippet, inspired by another developer, let me filter by date and keywords and safely delete posts in batches.
> - Backing up the archive, defining what to keep, avoiding total wipes, and running small tests turned cleanup into thoughtful curation, not erasure.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

In Italy, the 2nd of November is the _Day of the Dead_. A time to remember and, in a way, revive what’s gone.

So I thought, what better day to bring back my old X (formerly Twitter) account?

When I logged in after four years of inactivity, what I found was a graveyard of auto-retweets, broken links, and random thoughts from a younger me. Before I could start posting again about my writing, my old profile needed a proper account cleanup.

## Delete or Preserve? Finding the Balance

Every few years, we seem to go through the same digital ritual: opening an old account and wondering whether it’s better to start fresh or leave everything as it is.

There’s a strange tension in that choice. On one hand, deleting feels liberating; a clean slate, free from the noise and half-thought posts of another time. On the other, those same posts are traces of who we were, snapshots of what we cared about, and evidence of how we’ve changed. It’s easy to see them as outdated, but they can also be a record of growth.

The truth is, there’s no universal rule. The right choice depends on what you want that account to be now. If you’re relaunching it with a new focus — to share your work, reconnect with a community, or simply be active again — then some curation helps. If the account has personal meaning, or if its old posts still say something true about your path, keeping them makes sense.

![A close-up shot of a person's hands holding a dark smartphone while wearing a grey hoodie and dark trousers. A classic black dive watch with a rotating bezel and a black strap is visible on their wrist.](x-feed-balance.jpg 'Photo by <a href="https://unsplash.com/@nate_dumlao?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Nathan Dumlao</a> on <a href="https://unsplash.com/?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a>')

In my case, I found two full years of automation. An unintended experiment in noise. I once had a plugin on this website that would automatically tweet one of my past articles each day to “keep things active.” It seemed clever at the time, but it turned my timeline into a random feed of links without context. By 2017, the automation doubled to two tweets a day, and I had thousands of repetitive posts that added no value and broken links that no longer worked.

When I looked back at that timeline, I didn’t feel embarrassed, just disconnected. It wasn’t me anymore, and it definitely didn’t represent what I want to post today. But there were still parts worth keeping: conversations with other individuals, notes from events, and posts that marked what I was working on.

So my decision was simple: **delete the noise, keep the story**. I didn’t want to erase the past; I just wanted it to make sense again.

## Manual Cleanup, Too Slow to Be Practical

I started by doing things the slow way: manually deleting and un-reposting items from 2021 back to 2017. That took around five hours. Then I gave up.

X doesn’t make this easy. There’s no way to select multiple posts or delete them in bulk. You have to remove them one by one from your profile, and the process quickly becomes tedious when you’ve got years of content to go through.

That’s when I started searching for alternatives. Could I automate this somehow?

Officially, X doesn’t provide any built-in bulk delete option. Their [help page](https://help.x.com/en/using-x/delete-posts) confirms that you can only delete posts individually.

The X API does technically support deletion through the `DELETE /2/tweets/:id` endpoint, but there are limitations. According to the [API documentation](https://docs.x.com/x-api/fundamentals/rate-limits), requests are subject to strict rate limits, around 50 deletes every 15 minutes. X’s rules also discourage large-scale automated deletions that exceed those limits or mimic spammy behavior. In short, it’s possible to automate deletions, but not to wipe an entire timeline instantly.

The next option is to use third-party tools that connect to your account through the X API and handle deletion for you. These tools often go beyond what the official interface offers:

- They can filter posts by date, keywords, or media type.
- Some support automated schedules for regular cleanups.
- They handle the API rate limits for you, running in the background until the job is done.

Each works slightly differently, but the concept is the same: they log into your account via the API and delete content based on your filters.

Of course, that comes with risks. You need to give these services permission to access your account, sometimes with write access. This means they could theoretically delete everything (and more). So it’s worth double-checking the permissions and sticking to reputable tools only.

After realizing how slow the manual process was, I decided to go this route; not for a full wipe, but for **selective automation**: enough to clean up what I didn’t need without erasing everything that still told part of my story.

## Automating My X Account Cleanup

Once I accepted that manual deletion wasn’t realistic, I started looking for a smarter way. Most tools I found could bulk delete posts, but they were all-or-nothing; perfect for wiping your account clean, not for keeping what still mattered.

I wanted something more selective: delete by date range, skip posts that linked the current domain of this website, and preserve discussions with users I still follow or value.

That’s when I came across a [post by Maximiliano Fonseca](https://medium.com/@maxfonseca.r/how-i-automated-bulk-cleanup-of-my-x-twitter-account-with-a-simple-console-script-e869c22e2116). His approach was refreshingly simple: a JavaScript snippet you can run directly from your browser console. It scrolls through your profile, finds your posts, and deletes them right from the web interface. No API tokens, no rate limits, no third-party logins.

I took his base idea and customized it. My version added:

- **Date filtering:** delete only between 2014 and 2017, the years when my automation plugin was active.
- **Keyword filtering:** skip posts containing my blog’s current URL, to keep those links alive, replies or discussions with specific users by checking for their @handles, or any other keyword I wanted to look out for.

Once it started, the process took about **15 minutes** from start to finish. The script mimics human actions in the browser, just much faster. No API usage means no API rate limits. I could see posts disappearing in real time; a strangely satisfying sight after hours of manual deletion.

When it was done, the feed finally made sense again. The random noise was gone, the relevant posts remained, and the account felt like something I could actually use in 2025 without cringing at my 2016 automation habits.

### The Cleanup Script

Below is my customized version of Maximiliano’s script. To use it, make sure you first set the variables in the `CONFIG` section. As mentioned for the original script, Maximilano recommends to set longer wait times (in milliseconds) for the first run.

Once that is done, open the X page that you want to clean-up:

- Timeline: `https://x.com/your_username`
- Replies: `https://x.com/your_username/with_replies`
- Likes: `https://x.com/your_username/likes`
- Retweets: `https://x.com/your_username/with_replies?mode=retweets`

Next, open your browser’s console (usually `F12` or `Ctrl+Shift+I`) and paste the configured script in it, hit Enter, and let the script do its work.

Monitor your browser’s console for any errors, and repeat the process as needed.

> [!disclaimer]
> I used this script only once on my X account. I never tested it extensively. Use it at your own risk.

```javascript
// === CONFIG ===
var USER = "your_x_handle"; // your @ without the @
var MODE = "timeline"; // 'timeline' | 'replies' | 'likes' | 'retweets'
var BASE_DELAY = 1000; // ms between each item
var CONFIRM_DELAY = 800; // ms for dialogs
var SCROLL_DELAY = 1500; // ms between scrolls
var MAX_SCROLLS = 800; // safety limit. Stop after these many scrolls

// Delete window (inclusive):
var START_DATE = new Date("2016-01-01");
var END_DATE = null; // e.g., new Date('2019-12-31')

// Skip tweets containing ANY of these words/phrases (case-insensitive)
var SKIP_KEYWORDS = ["yoursite.com", "@example", "#portfolio", "anything"];

// === UTILS ===
function parseTweetDate(article) {
  var t = article.querySelector("time");
  if (!t) return null;
  var iso = t.getAttribute("datetime") || t.dateTime || "";
  var d = new Date(iso);
  if (!isNaN(d)) return d;
  var txt = (t.textContent || "").trim();
  var d2 = new Date(txt);
  return isNaN(d2) ? null : d2;
}

function inRange(date) {
  if (!date) return false;
  if (END_DATE) return date >= START_DATE && date <= END_DATE;
  return date >= START_DATE;
}

function isMine(article) {
  return !!(
    article.querySelector(
      '[data-testid="UserAvatar-Container-' + USER + '"]',
    ) ||
    article.querySelector('a[role="link"][href*="/' + USER.toLowerCase() + '"]')
  );
}

function processWithDelay(items, fn) {
  items.forEach(function (item, i) {
    setTimeout(function () {
      fn(item);
    }, i * BASE_DELAY);
  });
}

function containsSkipKeyword(article) {
  var text = article.textContent.toLowerCase();
  return SKIP_KEYWORDS.some(function (word) {
    return text.includes(word.toLowerCase());
  });
}

// === ACTIONS ===
function clickDeleteFlow(article) {
  var caret = article.querySelector('[data-testid="caret"]');
  if (!caret) return;
  caret.click();
  setTimeout(function () {
    var delOpt = Array.from(
      document.querySelectorAll('div[role="menuitem"]'),
    ).find(function (el) {
      return el.textContent.trim().toLowerCase() === "delete";
    });
    if (!delOpt) {
      caret.click();
      return;
    }
    delOpt.click();
    setTimeout(function () {
      var confirmBtn = document.querySelector(
        '[data-testid="confirmationSheetDialog"] button',
      );
      if (confirmBtn) confirmBtn.click();
    }, CONFIRM_DELAY);
  }, CONFIRM_DELAY);
}

function clickUnlike(article) {
  var btn = document.evaluate(
    ".//div[3]/button",
    article,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  ).singleNodeValue;
  if (btn) btn.click();
}

function clickUnretweet(article) {
  var unrtBtn = article.querySelector('[data-testid="unretweet"]');
  if (!unrtBtn) return;
  unrtBtn.click();
  setTimeout(function () {
    var xpath =
      '//*[@id="layers"]/div[2]/div/div/div/div[2]/div/div[3]/div/div/div/div';
    var confirm = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
    if (confirm) confirm.click();
  }, CONFIRM_DELAY);
}

// === MAIN LOOP ===
var seenIds = new Set();
var scrolls = 0;

function collectArticles() {
  return Array.from(document.getElementsByTagName("article"));
}

function articleKey(a) {
  var time = a.querySelector("time");
  var href = time ? time.closest('a[role="link"]') : null;
  return (href && href.href) || a.outerHTML.slice(0, 200);
}

function handleBatch() {
  var articles = collectArticles();

  var candidates = articles.filter(function (a) {
    var key = articleKey(a);
    if (seenIds.has(key)) return false;
    seenIds.add(key);

    if (containsSkipKeyword(a)) return false;

    var d = parseTweetDate(a);
    if (!inRange(d)) return false;

    if (MODE === "timeline" || MODE === "replies") return isMine(a);
    return true;
  });

  if (MODE === "timeline" || MODE === "replies") {
    processWithDelay(candidates, clickDeleteFlow);
  } else if (MODE === "likes") {
    processWithDelay(candidates, clickUnlike);
  } else if (MODE === "retweets") {
    processWithDelay(candidates, clickUnretweet);
  }

  // Scroll logic
  var dates = articles
    .map(parseTweetDate)
    .filter(Boolean)
    .sort(function (a, b) {
      return a - b;
    });
  var oldest = dates[0];

  setTimeout(
    function () {
      if (scrolls >= MAX_SCROLLS) {
        console.warn("Stop: hit MAX_SCROLLS =", MAX_SCROLLS);
        return;
      }
      var needMore =
        !oldest || (END_DATE ? oldest > START_DATE : oldest > START_DATE);
      if (needMore) {
        scrolls++;
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(handleBatch, SCROLL_DELAY);
      } else {
        var more = collectArticles().some(function (a) {
          var d = parseTweetDate(a);
          return d && inRange(d) && !containsSkipKeyword(a);
        });
        if (more && scrolls < MAX_SCROLLS) {
          scrolls++;
          window.scrollTo(0, document.body.scrollHeight);
          setTimeout(handleBatch, SCROLL_DELAY);
        } else {
          console.log(
            "Done. Scans:",
            scrolls,
            "Processed items this run:",
            candidates.length,
          );
        }
      }
    },
    candidates.length * BASE_DELAY + 500,
  );
}

// === RUN ===
switch (MODE) {
  case "timeline":
  case "replies":
  case "likes":
  case "retweets":
    handleBatch();
    break;
  default:
    console.warn("Unknown MODE:", MODE);
}
```

## Lessons Learned & Tips

Cleaning up an old social account sounds simple, but it quickly becomes a mix of archaeology and automation. A few things I learned along the way:

- **Backup first.** Before deleting anything, download your X archive. It’s a single ZIP file, and it gives you peace of mind in case you delete something you later regret.
- **Filter with intention.** Define what you want to keep before you start deleting. For me, that meant preserving blog links and meaningful replies.
- **Avoid full wipes.** Total resets feel tempting, but they also erase context. A selective cleanup gives you a fresh start without pretending the past never happened.
- **Trust carefully.** If you use third-party tools, review their permissions and revoke access once you’re done. The script method keeps everything local, no external logins are required.
- **Automate in small batches.** Even with browser scripts, things can go wrong. Run short sessions, watch what happens, and stop if anything looks off.
- **It’s okay to evolve.** Your old posts don’t have to align perfectly with who you are now. Keeping a few imperfect ones is part of the story.

After the cleanup, my account finally felt usable again; clean, current, but still mine. It’s amazing how a bit of pruning can make old platforms feel new again.

## Follow Me on X

If you want to see what I’m sharing next about [leadership](/section/leadership/ "Leadership"), the [web](/section/web/ "Web Tech"), or [programming](/section/programming/ "Programming"), you can find me on X at [**@nicolamustone**](https://x.com/nicolamustone). And please, do share this or any other essays from my website. Any little visibility boost will help!
