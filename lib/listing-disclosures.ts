import type {
  CarListing,
  KnownIssueFlag,
  SellerTitleStatus,
  VehicleConditionStatus
} from "@/src/lib/listingTypes";

type BadgeTone = "positive" | "notice" | "warning";

export type DisclosureBadge = {
  key: string;
  label: string;
  tone: BadgeTone;
};

export type DisclosureOption<T extends string> = {
  value: T;
  label: string;
  shortLabel: string;
  description: string;
  tone: BadgeTone;
};

export const titleStatusOptions: Array<DisclosureOption<Exclude<SellerTitleStatus, "not_disclosed">>> = [
  {
    value: "paid_off_title_in_hand",
    label: "Paid off, title in hand",
    shortLabel: "Title in hand",
    description: "No loan and the title is ready to transfer.",
    tone: "positive"
  },
  {
    value: "paid_off_title_pending",
    label: "Paid off, title pending",
    shortLabel: "Title pending",
    description: "Paid off, but waiting on the physical or electronic title.",
    tone: "notice"
  },
  {
    value: "financed_lien",
    label: "Financed or lien payoff",
    shortLabel: "Loan payoff",
    description: "There is a lender payoff step before transfer.",
    tone: "notice"
  },
  {
    value: "lease_payoff",
    label: "Lease payoff",
    shortLabel: "Lease payoff",
    description: "A lease buyout or payoff needs to be handled.",
    tone: "warning"
  },
  {
    value: "not_sure",
    label: "Not sure yet",
    shortLabel: "Title unsure",
    description: "The title or payoff status still needs confirmation.",
    tone: "warning"
  }
];

export const vehicleConditionOptions: Array<DisclosureOption<Exclude<VehicleConditionStatus, "not_disclosed">>> = [
  {
    value: "excellent",
    label: "Excellent working order",
    shortLabel: "Excellent",
    description: "No known mechanical or drivability issues.",
    tone: "positive"
  },
  {
    value: "good",
    label: "Good working order",
    shortLabel: "Good condition",
    description: "Runs and drives well with normal used-car wear.",
    tone: "positive"
  },
  {
    value: "runs_with_issues",
    label: "Runs with known issues",
    shortLabel: "Runs, issues",
    description: "Drivable, but the buyer should know about issues.",
    tone: "notice"
  },
  {
    value: "needs_repair",
    label: "Needs repair",
    shortLabel: "Needs repair",
    description: "Needs repair before it should be treated as sorted.",
    tone: "warning"
  },
  {
    value: "mechanic_special",
    label: "Mechanic special",
    shortLabel: "Mechanic special",
    description: "Best for a buyer who can diagnose and repair it.",
    tone: "warning"
  },
  {
    value: "project_non_running",
    label: "Project or non-running",
    shortLabel: "Project car",
    description: "Not ready for normal daily-driver expectations.",
    tone: "warning"
  }
];

export const knownIssueOptions: Array<DisclosureOption<KnownIssueFlag>> = [
  {
    value: "warning_lights",
    label: "Warning lights",
    shortLabel: "Warning lights",
    description: "Dash lights or diagnostic codes are present.",
    tone: "notice"
  },
  {
    value: "engine_issue",
    label: "Engine issue",
    shortLabel: "Engine issue",
    description: "Engine concern disclosed by the seller.",
    tone: "warning"
  },
  {
    value: "transmission_issue",
    label: "Transmission issue",
    shortLabel: "Trans issue",
    description: "Transmission concern disclosed by the seller.",
    tone: "warning"
  },
  {
    value: "leak",
    label: "Leak",
    shortLabel: "Leak",
    description: "Fluid leak, water leak, or similar issue.",
    tone: "notice"
  },
  {
    value: "body_damage",
    label: "Body damage",
    shortLabel: "Body damage",
    description: "Visible body damage or cosmetic repair needed.",
    tone: "notice"
  },
  {
    value: "rebuilt_or_salvage_title",
    label: "Rebuilt or salvage title",
    shortLabel: "Branded title",
    description: "Title brand needs buyer review before purchase.",
    tone: "warning"
  },
  {
    value: "ac_or_heat_issue",
    label: "A/C or heat issue",
    shortLabel: "A/C or heat",
    description: "Climate-control issue disclosed by the seller.",
    tone: "notice"
  },
  {
    value: "tires_or_brakes_due",
    label: "Tires or brakes due",
    shortLabel: "Tires/brakes",
    description: "Wear items likely need attention soon.",
    tone: "notice"
  }
];

const titleStatusByValue = new Map(titleStatusOptions.map((option) => [option.value, option]));
const vehicleConditionByValue = new Map(vehicleConditionOptions.map((option) => [option.value, option]));
const knownIssueByValue = new Map(knownIssueOptions.map((option) => [option.value, option]));

const issuePriority: KnownIssueFlag[] = [
  "rebuilt_or_salvage_title",
  "engine_issue",
  "transmission_issue",
  "warning_lights",
  "leak",
  "body_damage",
  "ac_or_heat_issue",
  "tires_or_brakes_due"
];

export function getTitleStatusOption(value: SellerTitleStatus) {
  return value === "not_disclosed" ? undefined : titleStatusByValue.get(value);
}

export function getVehicleConditionOption(value: VehicleConditionStatus) {
  return value === "not_disclosed" ? undefined : vehicleConditionByValue.get(value);
}

export function getKnownIssueOption(value: KnownIssueFlag) {
  return knownIssueByValue.get(value);
}

export function getDisclosureBadges(listing: Pick<
  CarListing,
  "sellerTitleStatus" | "vehicleCondition" | "knownIssueFlags" | "sellerDisclosureNotes" | "tags"
>): DisclosureBadge[] {
  const badges: DisclosureBadge[] = [];
  const sellerTitleStatus = resolveSellerTitleStatus(listing);
  const vehicleConditionStatus = resolveVehicleConditionStatus(listing);
  const knownIssues = resolveKnownIssueFlags(listing);
  const titleStatus = getTitleStatusOption(sellerTitleStatus);
  const vehicleCondition = getVehicleConditionOption(vehicleConditionStatus);
  const priorityIssue = issuePriority.find((issue) => knownIssues.includes(issue));

  if (titleStatus) {
    badges.push({
      key: `title-${titleStatus.value}`,
      label: titleStatus.shortLabel,
      tone: titleStatus.tone
    });
  }

  if (vehicleCondition) {
    badges.push({
      key: `condition-${vehicleCondition.value}`,
      label: vehicleCondition.shortLabel,
      tone: vehicleCondition.tone
    });
  }

  if (priorityIssue) {
    const issue = getKnownIssueOption(priorityIssue);
    if (issue) {
      const extraCount = Math.max(0, knownIssues.length - 1);
      badges.push({
        key: `issue-${issue.value}`,
        label: extraCount > 0 ? `${issue.shortLabel} +${extraCount}` : issue.shortLabel,
        tone: issue.tone
      });
    }
  }

  if (badges.length === 0 && listing.sellerDisclosureNotes?.trim()) {
    badges.push({
      key: "seller-notes",
      label: "Seller notes",
      tone: "notice"
    });
  }

  return badges;
}

export function getDisclosureSearchText(listing: Pick<
  CarListing,
  "sellerTitleStatus" | "vehicleCondition" | "knownIssueFlags" | "sellerDisclosureNotes" | "tags"
>) {
  const sellerTitleStatus = resolveSellerTitleStatus(listing);
  const vehicleCondition = resolveVehicleConditionStatus(listing);
  const knownIssues = resolveKnownIssueFlags(listing);
  const labels = [
    getTitleStatusOption(sellerTitleStatus)?.label,
    getVehicleConditionOption(vehicleCondition)?.label,
    ...knownIssues.map((issue) => getKnownIssueOption(issue)?.label),
    listing.sellerDisclosureNotes
  ];

  return labels.filter(Boolean).join(" ");
}

function resolveSellerTitleStatus(listing: Pick<CarListing, "sellerTitleStatus" | "tags">) {
  if (listing.sellerTitleStatus !== "not_disclosed") {
    return listing.sellerTitleStatus;
  }

  return (
    titleStatusOptions.find((option) => listing.tags.includes(tagFromValue(option.value)))?.value ??
    "not_disclosed"
  );
}

function resolveVehicleConditionStatus(listing: Pick<CarListing, "vehicleCondition" | "tags">) {
  if (listing.vehicleCondition !== "not_disclosed") {
    return listing.vehicleCondition;
  }

  return (
    vehicleConditionOptions.find((option) => listing.tags.includes(tagFromValue(option.value)))?.value ??
    "not_disclosed"
  );
}

function resolveKnownIssueFlags(listing: Pick<CarListing, "knownIssueFlags" | "tags">) {
  if (listing.knownIssueFlags.length > 0) {
    return listing.knownIssueFlags;
  }

  return knownIssueOptions
    .filter((option) => listing.tags.includes(tagFromValue(option.value)))
    .map((option) => option.value);
}

function tagFromValue(value: string) {
  return value.replace(/_/g, "-");
}
