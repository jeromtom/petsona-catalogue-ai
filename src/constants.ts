import {
  LEGACY_PET_METAOBJECT_TYPE,
  LEGACY_PETS_METAFIELD_NAMESPACE,
  PETSONA_CUSTOM_DATA_NAMESPACE,
  PETSONA_PET_FIELD_KEYS,
  PETSONA_PET_METAOBJECT_TYPE,
} from "@petsona/contracts";

// Shared constants for the pet data layer, taxonomy seed, settings defaults,
// and the agentic detection pipeline. Nothing here talks to Shopify or the
// database directly; it is pure configuration other modules read from.

// ------------------------------------------------------------------
// Metaobject / metafield identifiers.
// These match the declarative definitions in shopify.app.toml. Do not
// create these definitions at runtime; they are registered on deploy.
// ------------------------------------------------------------------

export const PET_METAOBJECT_TYPE = PETSONA_PET_METAOBJECT_TYPE;
export { LEGACY_PET_METAOBJECT_TYPE };

export const PETS_METAFIELD_NAMESPACE = PETSONA_CUSTOM_DATA_NAMESPACE;
export { LEGACY_PETS_METAFIELD_NAMESPACE };
export const PETS_METAFIELD_KEY = "pets";
export const PETS_METAFIELD_TYPE = "list.metaobject_reference";

/** Field keys on the $app:pet metaobject, matching shopify.app.toml. */
export const PET_FIELD_KEYS = PETSONA_PET_FIELD_KEYS;

// ------------------------------------------------------------------
// Billing plans.
// ------------------------------------------------------------------

export const PLANS = {
  free: {
    key: "free",
    name: "Free",
    price: 0,
    features: [
      "Unlimited pet profiles",
      "Storefront pet capture widget",
      "Basic Pet Finder, up to 100 completions per month",
      "Three custom taxonomy entries",
    ],
  },
  growth: {
    key: "growth",
    name: "Growth",
    price: 29,
    features: [
      "Unlimited pet profiles",
      "Unlimited deterministic Finder completions",
      "500 AI-assisted Finder reranks per month",
      "Automated life-stage and reorder detections",
      "Shopify Flow custom triggers",
      "Advanced analytics",
      "Priority support",
    ],
  },
  scale: {
    key: "scale",
    name: "Scale",
    price: 79,
    features: ["Legacy compatibility with Growth features"],
  },
} as const;

export type PlanKey = keyof typeof PLANS;

/** Plans offered to new merchants. Scale remains a readable compatibility
 * value for existing subscriptions but is not available for new checkout. */
export const PUBLIC_PLAN_KEYS = ["free", "growth"] as const;
export type PublicPlanKey = (typeof PUBLIC_PLAN_KEYS)[number];

export interface PlanEntitlements {
  finderMonthlyCompletions: number | null;
  finderMonthlyAiReranks: number;
  customTaxonomyLimit: number | null;
  lifecycleCampaigns: boolean;
  certifiedEspAdapters: boolean;
  flowTriggers: boolean;
  advancedAnalytics: boolean;
}

export const PLAN_ENTITLEMENTS: Record<PlanKey, PlanEntitlements> = {
  free: {
    finderMonthlyCompletions: 100,
    finderMonthlyAiReranks: 0,
    customTaxonomyLimit: 3,
    lifecycleCampaigns: false,
    certifiedEspAdapters: false,
    flowTriggers: false,
    advancedAnalytics: false,
  },
  growth: {
    finderMonthlyCompletions: null,
    finderMonthlyAiReranks: 500,
    customTaxonomyLimit: null,
    lifecycleCampaigns: true,
    certifiedEspAdapters: true,
    flowTriggers: true,
    advancedAnalytics: true,
  },
  scale: {
    finderMonthlyCompletions: null,
    finderMonthlyAiReranks: 500,
    customTaxonomyLimit: null,
    lifecycleCampaigns: true,
    certifiedEspAdapters: true,
    flowTriggers: true,
    advancedAnalytics: true,
  },
};

// ------------------------------------------------------------------
// Agent detection kinds and campaign statuses.
// ------------------------------------------------------------------

export const DETECTION_KINDS = [
  "life_stage_transition",
  "reorder_window",
  "birthday_upcoming",
] as const;

export type DetectionKind = (typeof DETECTION_KINDS)[number];

export const DETECTION_STATUSES = [
  "new",
  "approved",
  "dismissed",
  "sent",
] as const;

export type DetectionStatus = (typeof DETECTION_STATUSES)[number];

export const CAMPAIGN_CHANNELS = ["email"] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const CAMPAIGN_STATUSES = ["draft", "approved", "sent"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

// ------------------------------------------------------------------
// Event bus names. Used to tag/route work between the webhook layer,
// the agentic detection jobs, and the campaign draft pipeline.
// ------------------------------------------------------------------

export const EVENTS = {
  petCreated: "petsona.pet.created",
  petUpdated: "petsona.pet.updated",
  petDeleted: "petsona.pet.deleted",
  orderRecorded: "petsona.order.recorded",
  detectionCreated: "petsona.detection.created",
  campaignDraftCreated: "petsona.campaign_draft.created",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

// ------------------------------------------------------------------
// Default species/breed taxonomy seed.
// ------------------------------------------------------------------

export interface TaxonomySeedBreed {
  slug: string;
  label: string;
}

export interface TaxonomySeedSpecies {
  slug: string;
  label: string;
  sortOrder: number;
  breeds: TaxonomySeedBreed[];
}

const DOG_BREEDS: TaxonomySeedBreed[] = [
  { slug: "labrador-retriever", label: "Labrador Retriever" },
  { slug: "golden-retriever", label: "Golden Retriever" },
  { slug: "german-shepherd", label: "German Shepherd" },
  { slug: "french-bulldog", label: "French Bulldog" },
  { slug: "poodle", label: "Poodle" },
  { slug: "bulldog", label: "Bulldog" },
  { slug: "beagle", label: "Beagle" },
  { slug: "rottweiler", label: "Rottweiler" },
  { slug: "dachshund", label: "Dachshund" },
  { slug: "yorkshire-terrier", label: "Yorkshire Terrier" },
  { slug: "boxer", label: "Boxer" },
  { slug: "siberian-husky", label: "Siberian Husky" },
  { slug: "great-dane", label: "Great Dane" },
  { slug: "chihuahua", label: "Chihuahua" },
  { slug: "shih-tzu", label: "Shih Tzu" },
  { slug: "border-collie", label: "Border Collie" },
  { slug: "pug", label: "Pug" },
  { slug: "mixed-breed", label: "Mixed Breed" },
];

const CAT_BREEDS: TaxonomySeedBreed[] = [
  { slug: "domestic-shorthair", label: "Domestic Shorthair" },
  { slug: "domestic-longhair", label: "Domestic Longhair" },
  { slug: "maine-coon", label: "Maine Coon" },
  { slug: "siamese", label: "Siamese" },
  { slug: "persian", label: "Persian" },
  { slug: "ragdoll", label: "Ragdoll" },
  { slug: "bengal", label: "Bengal" },
  { slug: "british-shorthair", label: "British Shorthair" },
  { slug: "sphynx", label: "Sphynx" },
  { slug: "russian-blue", label: "Russian Blue" },
  { slug: "scottish-fold", label: "Scottish Fold" },
  { slug: "mixed-breed", label: "Mixed Breed" },
];

export const DEFAULT_TAXONOMY_SEED: TaxonomySeedSpecies[] = [
  { slug: "dog", label: "Dog", sortOrder: 0, breeds: DOG_BREEDS },
  { slug: "cat", label: "Cat", sortOrder: 1, breeds: CAT_BREEDS },
  { slug: "bird", label: "Bird", sortOrder: 2, breeds: [] },
  { slug: "small_mammal", label: "Small Mammal", sortOrder: 3, breeds: [] },
  { slug: "reptile", label: "Reptile", sortOrder: 4, breeds: [] },
  { slug: "fish", label: "Fish", sortOrder: 5, breeds: [] },
  { slug: "other", label: "Other", sortOrder: 6, breeds: [] },
];

// ------------------------------------------------------------------
// Life-stage tables. Boundaries are in completed months of age.
// ------------------------------------------------------------------

export const DOG_SIZE_CLASSES = ["small", "medium", "large", "giant"] as const;
export type DogSizeClass = (typeof DOG_SIZE_CLASSES)[number];

export interface LifeStageBoundaries {
  toAdultMonths: number;
  toSeniorMonths: number;
}

export const DOG_LIFE_STAGE_TABLE: Record<DogSizeClass, LifeStageBoundaries> = {
  small: { toAdultMonths: 10, toSeniorMonths: 132 },
  medium: { toAdultMonths: 12, toSeniorMonths: 120 },
  large: { toAdultMonths: 15, toSeniorMonths: 96 },
  giant: { toAdultMonths: 24, toSeniorMonths: 84 },
};

export const CAT_LIFE_STAGE_TABLE: LifeStageBoundaries = {
  toAdultMonths: 12,
  toSeniorMonths: 132,
};

export const GENERIC_LIFE_STAGE_TABLE: LifeStageBoundaries = {
  toAdultMonths: 12,
  toSeniorMonths: 96,
};

/** Stage label used before the first transition, per species family. */
export const LIFE_STAGE_YOUNG_LABEL: Record<"dog" | "cat" | "generic", string> =
  {
    dog: "puppy",
    cat: "kitten",
    generic: "young",
  };
