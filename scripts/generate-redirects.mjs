// Generates public/_redirects (prebuild step). Static, no network — old post,
// feed, download, and legacy URLs → their current paths.
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { STATIC_BASE, DOWNLOADS_BASE } from "../src/lib/cdn.mjs";

const OUT = fileURLToPath(new URL("../public/_redirects", import.meta.url));

/** Old section-prefixed post URLs → flat slug. Frozen from WordPress.com. */
const POST_REDIRECTS = [
  [
    "/leadership/gaming-made-me-better-leader/",
    "/gaming-made-me-better-leader/",
  ],
  [
    "/leadership/learning-care-without-feeling/",
    "/learning-care-without-feeling/",
  ],
  [
    "/leadership/mastering-effective-feedback-facts-feelings-curiosity/",
    "/mastering-effective-feedback-facts-feelings-curiosity/",
  ],
  [
    "/leadership/psychological-safety-in-teams-people-first-leadership/",
    "/psychological-safety-in-teams-people-first-leadership/",
  ],
  [
    "/leadership/team-building-activities-for-work/",
    "/team-building-activities-for-work/",
  ],
  ["/leadership/time-off-for-leaders/", "/time-off-for-leaders/"],
  ["/leadership/tools-for-adhd-leadership/", "/tools-for-adhd-leadership/"],
  ["/observations/adhd-planner/", "/adhd-planner/"],
  [
    "/observations/ai-slop-midas-touch-modern-internet/",
    "/ai-slop-midas-touch-modern-internet/",
  ],
  ["/observations/buildings-never-were/", "/buildings-never-were/"],
  ["/observations/choosing-what-to-play/", "/choosing-what-to-play/"],
  [
    "/observations/vibe-writing-line-between-human-machine/",
    "/vibe-writing-line-between-human-machine/",
  ],
  ["/observations/what-is-a-web-developer/", "/what-is-a-web-developer/"],
  ["/observations/when-ai-stops-being-a-tool/", "/when-ai-stops-being-a-tool/"],
  ["/observations/write-in-markdown/", "/write-in-markdown/"],
  [
    "/programming/automated-x-account-cleanup/",
    "/automated-x-account-cleanup/",
  ],
  [
    "/programming/building-convolutional-neural-network-python-tensorflow/",
    "/building-convolutional-neural-network-python-tensorflow/",
  ],
  [
    "/programming/delete-expired-coupons-automatically-woocommerce/",
    "/delete-expired-coupons-automatically-woocommerce/",
  ],
  [
    "/programming/disable-gtin-requirements-non-eligible-woocommerce-products/",
    "/disable-gtin-requirements-non-eligible-woocommerce-products/",
  ],
  [
    "/programming/distilroberta-emotion-analysis-nlp-case-study/",
    "/distilroberta-emotion-analysis-nlp-case-study/",
  ],
  [
    "/programming/how-to-choose-a-software-license-for-your-next-project/",
    "/how-to-choose-a-software-license-for-your-next-project/",
  ],
  [
    "/programming/improve-woocommerce-related-products-recommendations/",
    "/improve-woocommerce-related-products-recommendations/",
  ],
  ["/programming/limits-of-machine-learning/", "/limits-of-machine-learning/"],
  [
    "/programming/make-product-attributes-linkable-woocommerce/",
    "/make-product-attributes-linkable-woocommerce/",
  ],
  [
    "/programming/neural-network-predict-resin-usage-3d-printed-miniatures/",
    "/neural-network-predict-resin-usage-3d-printed-miniatures/",
  ],
  [
    "/programming/what-is-vibe-coding-how-to-do-it/",
    "/what-is-vibe-coding-how-to-do-it/",
  ],
  [
    "/programming/woocommerce-eu-vat-number-setup/",
    "/woocommerce-eu-vat-number-setup/",
  ],
  [
    "/programming/woocommerce-password-strength-meter-checkout/",
    "/woocommerce-password-strength-meter-checkout/",
  ],
  ["/web/10-types-of-websites/", "/10-types-of-websites/"],
  [
    "/web/bulk-edit-woocommerce-products-without-plugins/",
    "/bulk-edit-woocommerce-products-without-plugins/",
  ],
  [
    "/web/creating-a-custom-add-to-cart-link-woocommerce/",
    "/creating-a-custom-add-to-cart-link-woocommerce/",
  ],
  [
    "/web/do-you-trust-your-instincts-making-smart-wordpress-choices/",
    "/do-you-trust-your-instincts-making-smart-wordpress-choices/",
  ],
  ["/web/edit-orders-woocommerce/", "/edit-orders-woocommerce/"],
  [
    "/web/enhancing-wordpress-content-protection-beyond-right-click-blocks/",
    "/enhancing-wordpress-content-protection-beyond-right-click-blocks/",
  ],
  [
    "/web/how-to-build-a-github-profile-readme-that-feels-like-you/",
    "/how-to-build-a-github-profile-readme-that-feels-like-you/",
  ],
  [
    "/web/set-up-tensorflow-docker-jupyter-notebook/",
    "/set-up-tensorflow-docker-jupyter-notebook/",
  ],
  [
    "/web/top-5-essential-wordpress-plugins-i-always-install-and-why/",
    "/top-5-essential-wordpress-plugins-i-always-install-and-why/",
  ],
  [
    "/web/woocommerce-attributes-vs-variations/",
    "/woocommerce-attributes-vs-variations/",
  ],
  [
    "/web/woocommerce-cli-product-management/",
    "/woocommerce-cli-product-management/",
  ],
  ["/web/wordpress-blocks-telex/", "/wordpress-blocks-telex/"],
  [
    "/web/wordpress-site-performance-vs-desig/",
    "/wordpress-site-performance-vs-desig/",
  ],
];

const INTERNAL_REDIRECTS = [
  ["/feed/", "/feed.xml"],
  ["/category/nicos-websites/", "/"],
];

/** Old bare category URLs → the new /section/<slug>/ archives. */
const SECTION_REDIRECTS = [
  ["/leadership/", "/section/leadership/"],
  ["/observations/", "/section/observations/"],
  ["/programming/", "/section/programming/"],
  ["/web/", "/section/web/"],
];

/** Old WordPress Download-Monitor URLs → the files on the R2 downloads
 *  subdomain (served directly by an R2 custom domain). */
const DOWNLOAD_REDIRECTS = [
  ["/download/eu-vat-rates/", `${DOWNLOADS_BASE}/eu-vat-rates.csv`],
  [
    "/download/quill-meetings-templates/",
    `${DOWNLOADS_BASE}/quill-meetings-templates.zip`,
  ],
  [
    "/download/cnn-mnist-use-case-tensorflow/",
    `${DOWNLOADS_BASE}/cnn-mnist-use-case-tensorflow.zip`,
  ],
  [
    "/download/time-off-handover-plan/",
    `${DOWNLOADS_BASE}/time-off-handover-plan.zip`,
  ],
  [
    "/download/dense-models-3d-print-cost-calculator/",
    `${DOWNLOADS_BASE}/dense-models-3d-print-cost-calculator.zip`,
  ],
  [
    "/download/distilroberta-emotion-analysis-dead-by-daylight-case-study/",
    `${DOWNLOADS_BASE}/distilroberta-emotion-analysis-dead-by-daylight-case-study.zip`,
  ],
];

/** The retired Pages Function paths → the R2 subdomains, so any published
 *  /downloads/<file> or /static/<file> URL keeps working. */
const R2_PASSTHROUGH_REDIRECTS = [
  ["/downloads/*", `${DOWNLOADS_BASE}/:splat`],
  ["/static/*", `${STATIC_BASE}/:splat`],
];

/**
 * Legacy 301s exported from the old WordPress redirect plugin.
 * [from path, to URL] — `to` may be a same-site path or an external URL.
 */
const LEGACY_REDIRECTS = [
  // Old WooCommerce tutorials → archive on the personal blog
  [
    "/2014/09/30/create-localized-bookable-products-wpml-woocommerce-bookings/",
    "https://nicolamustone.blog/old-articles-archive/",
  ],
  [
    "/2015/09/16/add-enquiry-form-product-page/",
    "https://nicolamustone.blog/old-articles-archive/",
  ],
  [
    "/2015/04/03/print-the-unit-price-in-the-checkout-page/",
    "https://nicolamustone.blog/old-articles-archive/",
  ],
  [
    "/2015/05/04/add-the-quantity-field-to-the-add_to_cart-shortcode/",
    "https://nicolamustone.blog/old-articles-archive/",
  ],
  [
    "/2015/01/22/track-conversions-with-the-google-analytics-tracking-code-in-woocommerce/",
    "https://nicolamustone.blog/old-articles-archive/",
  ],
  [
    "/2015/07/20/change-the-return-to-shop-button-url-in-the-cart-page/",
    "https://nicolamustone.blog/old-articles-archive/",
  ],
  [
    "/2016/04/19/adding-custom-fields-vendor-registration-form/",
    "https://nicolamustone.blog/old-articles-archive/",
  ],
  [
    "/2015/09/03/translate-wordpress-themes-plugins-poedit/",
    "https://nicolamustone.blog/old-articles-archive/",
  ],

  // Specific tutorials migrated to buthonestly.io
  [
    "/category/wordpress/woocommerce/",
    "https://buthonestly.io/topic/wordpress/",
  ],
  [
    "/2016/01/27/remove-the-password-strength-meter-on-the-checkout-page/",
    "https://buthonestly.io/woocommerce-password-strength-meter-checkout/",
  ],
  [
    "/2015/04/21/bulk-edit-products/",
    "https://buthonestly.io/bulk-edit-woocommerce-products-without-plugins/",
  ],
  [
    "/2015/09/18/creating-custom-add-to-cart-url/",
    "https://buthonestly.io/creating-a-custom-add-to-cart-link-woocommerce/",
  ],
];

function formatRule([from, to]) {
  return `${from}  ${to}  301`;
}

const body = [
  "# Generated by scripts/generate-redirects.mjs — do not edit by hand.",
  ...POST_REDIRECTS.map(formatRule),
  ...INTERNAL_REDIRECTS.map(formatRule),
  ...SECTION_REDIRECTS.map(formatRule),
  ...DOWNLOAD_REDIRECTS.map(formatRule),
  ...R2_PASSTHROUGH_REDIRECTS.map(formatRule),
  ...LEGACY_REDIRECTS.map(formatRule),
].join("\n");

await mkdir(fileURLToPath(new URL("../public", import.meta.url)), {
  recursive: true,
});
await writeFile(OUT, body, "utf8");

console.log(
  `Wrote ${OUT} — ${POST_REDIRECTS.length} post + ${INTERNAL_REDIRECTS.length} internal + ${SECTION_REDIRECTS.length} section + ${DOWNLOAD_REDIRECTS.length} download + ${R2_PASSTHROUGH_REDIRECTS.length} R2 passthrough + ${LEGACY_REDIRECTS.length} legacy rules`,
);
