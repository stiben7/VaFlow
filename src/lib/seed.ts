import type { Client } from "./types";

const BASECAMP = (id: string) =>
  `https://app.basecamp.com/5644180/projects/${id}`;

/**
 * The 26 live accounts, transcribed from Basecamp.
 *
 * `services` keeps the full deliverable text so the client detail panel can
 * show exactly what was sold -- that is the thing a VA actually needs when
 * deciding how much of a week an account deserves.
 *
 * `colorKey` is assigned once, here, and never recomputed. If it were derived
 * from array position the whole board would re-colour every time a client was
 * added, and colour recognition is the main thing that makes the week view
 * readable at a glance.
 */
export const SEED_CLIENTS: Client[] = [
  {
    id: "aj-bridal",
    name: "AJ Bridal Company",
    tier: "Accelerated Growth",
    strategist: null,
    services:
      "SEO + Sales Funnel: Enhanced Local SEO & Google Business Profile Optimization, Reputation Management (review requests & responses), Intro Sales Funnel (lead magnet + email setup), Content Marketing (2 blogs/emails/texts/GMB posts per month), Bridal Content Planner access, Monthly Strategy Call.",
    basecampUrl: BASECAMP("47119301"),
    colorKey: 0,
    archived: false,
  },
  {
    id: "alibers-bridal",
    name: "Aliber's Bridal",
    tier: "Foundation",
    strategist: "Courtney",
    services:
      "Basic Local SEO Optimization, Google My Business (GMB) Setup & Optimization, Bridal Content Planner access, Introduction to Content Marketing (1 blog post/email/text/GMB post per month).",
    basecampUrl: BASECAMP("47124488"),
    colorKey: 1,
    archived: false,
  },
  {
    id: "andersons-bride",
    name: "Anderson's Bride",
    tier: "Foundation",
    strategist: null,
    services:
      "Foundation Package plus Website Hosting and Maintenance. Basic Local SEO Optimization, GMB Setup & Optimization, Bridal Content Planner access, Introduction to Content Marketing (1 blog post/email/text/GMB post per month).",
    basecampUrl: BASECAMP("47862759"),
    colorKey: 2,
    archived: false,
  },
  {
    id: "ashley-grace-bridal",
    name: "Ashley Grace Bridal",
    tier: "Peak Performance",
    strategist: null,
    services:
      "Comprehensive Local SEO and GMB Management, Reputation Management (responding to and requesting reviews), Full-scale Content Marketing (4 blog posts/emails/texts/GMB posts per month), Bridal Content Planner access, Advanced Sales Funnel Implementation (multiple touchpoints and segmentation), Paid Advertising Management on two platforms (ad spend not included).",
    basecampUrl: BASECAMP("41764511"),
    colorKey: 3,
    archived: false,
  },
  {
    id: "atlanta-street-bridal",
    name: "Atlanta Street Bridal",
    tier: "Accelerated Growth",
    strategist: null,
    services: "Accelerated Growth Package. Running ads instead of a sales funnel.",
    basecampUrl: BASECAMP("44328264"),
    colorKey: 4,
    archived: false,
  },
  {
    id: "belle-amour-bridal",
    name: "Belle Amour Bridal",
    tier: "Peak Performance",
    strategist: null,
    services:
      "Comprehensive Local SEO and GMB Management, Reputation Management (responding to and requesting reviews), Full-scale Content Marketing (4 blog posts/emails/texts/GMB posts per month), Bridal Content Planner access, Advanced Sales Funnel Implementation (multiple touchpoints and segmentation), Paid Advertising Management on two platforms (ad spend not included).",
    basecampUrl: BASECAMP("40331317"),
    colorKey: 5,
    archived: false,
  },
  {
    id: "blush-and-ivory",
    name: "Blush & Ivory",
    tier: "Accelerated Growth",
    strategist: null,
    services: "Accelerated Growth Package.",
    basecampUrl: BASECAMP("42403335"),
    colorKey: 6,
    archived: false,
  },
  {
    id: "bridal-and-formal-boutique",
    name: "Bridal and Formal Boutique / House of Tux",
    tier: "Peak Performance",
    strategist: "Adrian Holland",
    services:
      "Comprehensive Local SEO and GMB Management, Reputation Management (responding to and requesting reviews), Full-scale Content Marketing (4 blog posts/emails/texts/GMB posts per month), Bridal Content Planner access, Advanced Sales Funnel Implementation (multiple touchpoints and segmentation), Paid Advertising Management on two platforms (ad spend not included).",
    basecampUrl: BASECAMP("40712381"),
    colorKey: 7,
    archived: false,
  },
  {
    id: "elegance-wedding",
    name: "Elegance Wedding",
    tier: "Accelerated Growth",
    strategist: null,
    services:
      "Enhanced Local SEO and GMB Optimization, Reputation Management (responding to and requesting reviews), Intro Sales Funnel Implementation (lead magnet creation, email marketing setup), Content Marketing (2 blog posts/emails/texts/GMB posts per month), Bridal Content Planner access, Monthly Check-In and Strategy Call.",
    basecampUrl: BASECAMP("44343301"),
    colorKey: 0,
    archived: false,
  },
  {
    id: "ever-after-bridal",
    name: "Ever After Bridal Boutique",
    tier: "Peak Performance",
    strategist: null,
    services:
      "Comprehensive Local SEO and GMB Management, Reputation Management (responding to and requesting reviews), Full-scale Content Marketing (4 blog posts/emails/texts/GMB posts per month), Bridal Content Planner access, Advanced Sales Funnel Implementation (multiple touchpoints and segmentation), Paid Advertising Management on two platforms (ad spend not included).",
    basecampUrl: BASECAMP("42716775"),
    colorKey: 1,
    archived: false,
  },
  {
    id: "formalities-boutique",
    name: "Formalities Boutique",
    tier: "Accelerated Growth",
    strategist: null,
    services: "Accelerated Growth Package with Paid Advertising.",
    basecampUrl: BASECAMP("46843957"),
    colorKey: 2,
    archived: false,
  },
  {
    id: "glitz-nashville",
    name: "Glitz Nashville",
    tier: "Peak Performance",
    strategist: null,
    services:
      "Comprehensive Local SEO and GMB Management, Reputation Management (responding to and requesting reviews), Full-scale Content Marketing (4 blog posts/emails/texts/GMB posts per month), Bridal Content Planner access, Advanced Sales Funnel Implementation (multiple touchpoints and segmentation), Paid Advertising Management on two platforms (ad spend not included).",
    basecampUrl: BASECAMP("48376974"),
    colorKey: 3,
    archived: false,
  },
  {
    id: "hailey-nicole-bridal",
    name: "Hailey Nicole Bridal",
    tier: "Accelerated Growth",
    strategist: null,
    services:
      "Enhanced Local SEO and GMB Optimization, Paid Advertising Management on one platform, Content Marketing (2 blogs or GMB posts per month), Reputation Management (review requests & responses), Bridal Content Planner access, Monthly Strategy Call.",
    basecampUrl: BASECAMP("46250656"),
    colorKey: 4,
    archived: false,
  },
  {
    id: "heart-to-heart-bride",
    name: "Heart to Heart Bride",
    tier: "Custom",
    strategist: "Sarah Ashworth",
    services: "Custom scope. Deliverables not yet itemised in Basecamp.",
    basecampUrl: BASECAMP("37770027"),
    colorKey: 5,
    archived: false,
  },
  {
    id: "ivoire-bridal-atelier",
    name: "Ivoire Bridal Atelier",
    tier: "Accelerated Growth",
    strategist: null,
    services:
      "Enhanced Local SEO & Google Business Profile Optimization, Reputation Management (review responses), Content Marketing (2 blogs or GMB posts per month), Bridal Content Planner access, Monthly Strategy Call, Google Ads.",
    basecampUrl: BASECAMP("46785782"),
    colorKey: 6,
    archived: false,
  },
  {
    id: "kb-bridals",
    name: "K&B Bridals",
    tier: "Peak Performance",
    strategist: "Courtney",
    services:
      "Peak Performance Custom. Comprehensive Local SEO and GMB Management, Reputation Management (responding to and requesting reviews), 4 blogs / GMB posts per month, Bridal Content Planner access, Advanced Sales Funnel Implementation (multiple touchpoints and segmentation), Paid Advertising Management on two platforms (ad spend not included).",
    basecampUrl: BASECAMP("41846178"),
    colorKey: 7,
    archived: false,
  },
  {
    id: "leora-bridal",
    name: "Leora Bridal",
    tier: "Accelerated Growth",
    strategist: null,
    services: "Accelerated Growth Package.",
    basecampUrl: BASECAMP("44676212"),
    colorKey: 0,
    archived: false,
  },
  {
    id: "olivier-couture",
    name: "Olivier Couture",
    tier: "Accelerated Growth",
    strategist: null,
    services:
      "SEO + Sales Funnel: Enhanced Local SEO & Google Business Profile Optimization, Reputation Management (review requests & responses), Intro Sales Funnel (lead magnet + email setup), Content Marketing (2 blogs/emails/texts/GMB posts per month), Bridal Content Planner access, Monthly Strategy Call.",
    basecampUrl: BASECAMP("46418544"),
    colorKey: 1,
    archived: false,
  },
  {
    id: "the-wedding-dresser",
    name: "The Wedding Dresser",
    tier: "Accelerated Growth",
    strategist: null,
    services:
      "Accelerated Growth Package. Paid advertising on one ad platform, no sales funnel.",
    basecampUrl: BASECAMP("43948558"),
    colorKey: 2,
    archived: false,
  },
  {
    id: "thistlerose-bridal",
    name: "ThistleRose Bridal",
    tier: "Accelerated Growth",
    strategist: null,
    services:
      "Intro Sales Funnel (lead magnet + email setup), Paid Advertising Management on one platform, Content Marketing (2 blogs or GMB posts per month), Reputation Management (review requests & responses), Bridal Content Planner access, Monthly Strategy Call.",
    basecampUrl: BASECAMP("46943610"),
    colorKey: 3,
    archived: false,
  },
  {
    id: "twirl-bride",
    name: "Twirl Bride",
    tier: "Peak Performance",
    strategist: "Laura Wingfield",
    services:
      "Comprehensive Local SEO and GMB Management, Reputation Management (responding to and requesting reviews), Full-scale Content Marketing (4 blog posts/emails/texts/GMB posts per month), Bridal Content Planner access, Advanced Sales Funnel Implementation (multiple touchpoints and segmentation), Paid Advertising Management on two platforms (ad spend not included).",
    basecampUrl: BASECAMP("40974312"),
    colorKey: 4,
    archived: false,
  },
  {
    id: "two-hearts-bridal",
    name: "Two Hearts Bridal",
    tier: "Custom",
    strategist: "Sarah Ashworth",
    services: "Custom scope. Deliverables not yet itemised in Basecamp.",
    basecampUrl: BASECAMP("37770024"),
    colorKey: 5,
    archived: false,
  },
  {
    id: "wed-bridal-boutique",
    name: "WED Bridal Boutique",
    tier: "Paid Ads Only",
    strategist: null,
    services: "Solo paid ads.",
    basecampUrl: BASECAMP("47720935"),
    colorKey: 6,
    archived: false,
  },
  {
    id: "weddings-and-dreams",
    name: "Weddings and Dreams",
    tier: "Foundation",
    strategist: "Courtney",
    services:
      "Basic Local SEO Optimization, Google My Business (GMB) Setup & Optimization, Bridal Content Planner access, Introduction to Content Marketing (1 blog post/email/text/GMB post per month).",
    basecampUrl: BASECAMP("40004600"),
    colorKey: 7,
    archived: false,
  },
  {
    id: "white-weddings",
    name: "White Weddings",
    tier: "Paid Ads Only",
    strategist: null,
    services:
      "Paid ads only. Two locations: Tallahassee FL and Valdosta GA.",
    basecampUrl: BASECAMP("44192520"),
    colorKey: 0,
    archived: false,
  },
  {
    id: "zen-bridal",
    name: "Zen Bridal",
    tier: "Accelerated Growth",
    strategist: "Courtney",
    services:
      "Accelerated Growth with Paid Advertising. Enhanced Local SEO and GMB Optimization, Paid Advertising.",
    basecampUrl: BASECAMP("47080162"),
    colorKey: 1,
    archived: false,
  },
];

