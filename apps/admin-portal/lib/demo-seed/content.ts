/**
 * The demo's fictional business: Harbourside Bakery, a family bakery on the
 * Esplanade in Cairns. Every name, number and contact here is made up.
 *
 * This file is the hand-written part of the demo seed. The AI-made parts
 * (the processed document, its embeddings, routing suggestions and gap
 * reports) are in generated.json, built once by scripts/demo/build-seed.ts.
 */

export type DemoVersion = {
  content?: string;
  structuredData?: Record<string, unknown>;
  changeDescription: string;
  changeSource: 'manual' | 'ai_edit' | 'ai_ingest' | 'ai_gap_fill';
};

export type DemoSection = {
  slug: string;
  title: string;
  description: string;
  template: 'prose' | 'cards' | 'table' | 'checklist' | 'kv-pairs';
  /** Oldest first; the last one is current. */
  versions: DemoVersion[];
};

export type DemoWorkspace = {
  /** Stable key; the database slug gets the user id appended. */
  key: string;
  title: string;
  description: string;
  icon: string;
  sections: DemoSection[];
};

const OPENING_V1 = `## Opening

The first baker arrives at 4:30 am, switches on the deck ovens and starts the sourdough. The shop opens at 6:30 am.

## Closing

Clean the slicer and mop the floor before leaving.`;

const OPENING_V2 = `## Opening

The first baker arrives at 4:30 am.

1. Switch on both deck ovens (they take 40 minutes to reach 230 °C).
2. Check the proving cabinet reads 27 °C.
3. Start the sourdough bake, then the pastry.

The front counter opens to customers at 6:30 am.

## Closing

1. Bag unsold bread for the community pantry (collected at 3 pm).
2. Clean the slicer and mop the bakehouse floor.
3. Lock the flour store.`;

const OPENING_V3 = `## Opening

The first baker arrives at 4:30 am.

1. Switch on both deck ovens. They take about 40 minutes to reach 230 °C.
2. Check the proving cabinet reads 27 °C. If it's below 25 °C, tell the head baker before loading dough.
3. Record the cold room temperature on the clipboard (see Food safety).
4. Start the sourdough bake, then the pastry.

The front counter opens to customers at 6:30 am. The counter lead counts the float ($200) before opening.

## Closing

1. Bag unsold bread for the community pantry on Lake Street. They collect at 3 pm.
2. Clean the slicer and mop the bakehouse floor.
3. Record the closing cold room temperature.
4. Lock the flour store and set the alarm.

The last person out texts the head baker when the alarm is set.`;

export const DEMO_WORKSPACES: DemoWorkspace[] = [
  {
    key: 'operations',
    title: 'Operations Manual',
    description:
      'How the bakery runs day to day: opening and closing, food safety, equipment and cleaning.',
    icon: 'clipboard-list',
    sections: [
      {
        slug: 'opening-closing',
        title: 'Opening and closing',
        description: 'The daily routine for the first and last person in the building',
        template: 'prose',
        versions: [
          { content: OPENING_V1, changeDescription: 'First draft', changeSource: 'manual' },
          {
            content: OPENING_V2,
            changeDescription: 'Split into numbered steps',
            changeSource: 'manual',
          },
          {
            content: OPENING_V3,
            changeDescription: 'Added temperature checks, the float and the alarm',
            changeSource: 'manual',
          },
        ],
      },
      {
        slug: 'food-safety',
        title: 'Food safety and temperatures',
        description: 'Daily checks that keep the bakery within its food safety plan',
        template: 'checklist',
        versions: [
          {
            structuredData: {
              items: [
                {
                  text: 'Cold room between 1 and 5 °C at opening, midday and close',
                  checked: true,
                },
                { text: 'Reach-in fridges below 5 °C', checked: true },
                { text: 'Every tray of filling labelled with the date it was made', checked: true },
                { text: 'Custard and cream fillings discarded after 48 hours', checked: false },
                { text: 'Hand-wash sink stocked with soap and paper towel', checked: true },
                { text: 'Probe thermometer calibrated this month', checked: false },
              ],
            },
            changeDescription: 'Initial checklist',
            changeSource: 'manual',
          },
        ],
      },
      {
        slug: 'equipment',
        title: 'Equipment',
        description: 'Major equipment, where it is and who services it',
        template: 'table',
        versions: [
          {
            structuredData: {
              columns: ['Item', 'Location', 'Serviced by', 'Last service'],
              rows: [
                {
                  Item: 'Deck oven 1',
                  Location: 'Bakehouse',
                  'Serviced by': 'Tropic Oven Services',
                  'Last service': 'March 2026',
                },
                {
                  Item: 'Deck oven 2',
                  Location: 'Bakehouse',
                  'Serviced by': 'Tropic Oven Services',
                  'Last service': 'March 2026',
                },
                {
                  Item: 'Spiral mixer',
                  Location: 'Bakehouse',
                  'Serviced by': 'In house',
                  'Last service': 'August 2026',
                },
                {
                  Item: 'Cold room',
                  Location: 'Back store',
                  'Serviced by': 'Far North Refrigeration',
                  'Last service': 'June 2026',
                },
                {
                  Item: 'Bread slicer',
                  Location: 'Front counter',
                  'Serviced by': 'In house',
                  'Last service': 'September 2026',
                },
              ],
            },
            changeDescription: 'Initial list',
            changeSource: 'manual',
          },
        ],
      },
      {
        slug: 'cleaning-schedule',
        title: 'Cleaning schedule',
        description: 'What gets cleaned, how often and by whom',
        template: 'prose',
        versions: [
          {
            content: 'Clean the bakehouse every day. Deep clean once a month.',
            changeDescription: 'Placeholder',
            changeSource: 'manual',
          },
        ],
      },
    ],
  },
  {
    key: 'suppliers',
    title: 'Suppliers and Ordering',
    description: 'Who supplies the bakery, when deliveries arrive and how orders are placed.',
    icon: 'briefcase',
    sections: [
      {
        slug: 'supplier-list',
        title: 'Supplier list',
        description: 'Regular suppliers and their delivery days',
        template: 'table',
        versions: [
          {
            structuredData: {
              columns: ['Supplier', 'Supplies', 'Delivery days', 'Order by'],
              rows: [
                {
                  Supplier: 'Tableland Mills',
                  Supplies: 'Flour (bakers, wholemeal, rye)',
                  'Delivery days': 'Tuesday, Friday',
                  'Order by': 'Previous day, 2 pm',
                },
                {
                  Supplier: 'Barron Valley Dairy',
                  Supplies: 'Butter, cream, milk',
                  'Delivery days': 'Monday, Wednesday, Friday',
                  'Order by': 'Previous day, 12 pm',
                },
                {
                  Supplier: 'Coastal Eggs',
                  Supplies: 'Free-range eggs',
                  'Delivery days': 'Monday, Thursday',
                  'Order by': 'Previous day, 4 pm',
                },
                {
                  Supplier: 'North Queensland Packaging',
                  Supplies: 'Bags, boxes, labels',
                  'Delivery days': 'Fortnightly, Wednesday',
                  'Order by': 'Monday',
                },
              ],
            },
            changeDescription: 'Initial list',
            changeSource: 'manual',
          },
        ],
      },
      {
        slug: 'ordering-rules',
        title: 'Ordering rules',
        description: 'How much to order and who can approve it',
        template: 'prose',
        versions: [
          {
            content: `The head baker places all ingredient orders. The counter lead orders packaging.

- Keep at least four days of flour in the store. One pallet (40 bags) covers about a week.
- Order dairy for two days at a time; the cold room can't hold more.
- Any single order over $1,500 needs the owner's approval by text before it's placed.
- Check every delivery against the invoice before the driver leaves, and write any shortfall on the delivery docket.`,
            changeDescription: 'Initial rules',
            changeSource: 'manual',
          },
        ],
      },
      {
        slug: 'key-contacts',
        title: 'Key contacts',
        description: 'Who to call about orders and deliveries',
        template: 'kv-pairs',
        versions: [
          {
            structuredData: {
              pairs: [
                { key: 'Tableland Mills orders', value: 'Priya, orders desk (07 4000 1111)' },
                { key: 'Barron Valley Dairy', value: 'Sam, driver (0400 000 222)' },
                { key: 'Refrigeration faults', value: 'Far North Refrigeration (07 4000 3333)' },
                { key: 'Owner', value: 'Marie Laurent' },
              ],
            },
            changeDescription: 'Initial contacts',
            changeSource: 'manual',
          },
        ],
      },
    ],
  },
  {
    key: 'staff',
    title: 'Staff Handbook',
    description: 'Roles, rosters and what new staff need to know in their first week.',
    icon: 'users',
    sections: [
      {
        slug: 'roles',
        title: 'Roles',
        description: 'Who does what',
        template: 'cards',
        versions: [
          {
            structuredData: {
              items: [
                {
                  title: 'Head baker',
                  body: 'Runs the bakehouse, writes the bake plan and places ingredient orders.',
                  tags: ['bakehouse'],
                },
                {
                  title: 'Baker',
                  body: 'Mixes, shapes and bakes to the daily plan. Starts at 4:30 am.',
                  tags: ['bakehouse'],
                },
                {
                  title: 'Counter lead',
                  body: 'Opens the shop, manages the float and orders packaging.',
                  tags: ['front of house'],
                },
                {
                  title: 'Counter staff',
                  body: 'Serves customers, keeps the display stocked and cleans the front.',
                  tags: ['front of house'],
                },
              ],
            },
            changeDescription: 'Initial roles',
            changeSource: 'manual',
          },
        ],
      },
      {
        slug: 'rostering',
        title: 'Rostering',
        description: 'How shifts are planned and swapped',
        template: 'prose',
        versions: [
          {
            content: 'Rosters go up on the board every Friday.',
            changeDescription: 'Placeholder',
            changeSource: 'manual',
          },
        ],
      },
      {
        slug: 'onboarding-checklist',
        title: 'Onboarding checklist',
        description: "A new starter's first week",
        template: 'checklist',
        versions: [
          {
            structuredData: {
              items: [
                { text: 'Tax file number declaration and super choice form', checked: false },
                { text: 'Food handler training certificate on file', checked: false },
                { text: 'Walk-through of the fire exits and first aid kit', checked: false },
                { text: 'Shadow a full opening shift', checked: false },
                { text: 'Read the Food safety and temperatures checklist', checked: false },
              ],
            },
            changeDescription: 'Initial checklist',
            changeSource: 'manual',
          },
        ],
      },
    ],
  },
];

/** Workspaces the build script runs a gap analysis on. */
export const GAP_REPORT_WORKSPACES = ['operations', 'staff'];

/**
 * The document that arrives already processed and routed, so the inbox
 * isn't empty. Its text is in documents/; the AI output is in generated.json.
 */
export const PREROUTED_DOCUMENT = {
  filename: 'allergen-labelling-update.md',
  title: 'Allergen labelling update',
};

export const DEMO_CLIENTS = [
  {
    key: 'reef-cafe',
    contactName: 'Tom Nguyen',
    companyName: 'Reef Street Café',
    email: 'tom@reefstreetcafe.example',
    phone: '0400 000 101',
    status: 'active',
    type: 'client',
    industry: 'Hospitality',
    notes: 'Wholesale sourdough and croissants, delivered daily at 6 am.',
  },
  {
    key: 'esplanade-hotel',
    contactName: 'Aisha Rahman',
    companyName: 'Esplanade Hotel',
    email: 'catering@esplanadehotel.example',
    phone: '07 4000 0202',
    status: 'active',
    type: 'client',
    industry: 'Hospitality',
    notes: 'Breakfast pastries for the buffet; order changes with occupancy.',
  },
  {
    key: 'school-fete',
    contactName: 'Jess Walker',
    companyName: 'Edge Hill State School P&C',
    email: 'pandc@edgehill.example',
    phone: '0400 000 303',
    status: 'lead',
    type: 'lead',
    industry: 'Education',
    notes: 'Asked about bread rolls for the spring fete.',
  },
] as const;

export const DEMO_JOBS = [
  {
    client: 'esplanade-hotel',
    title: 'Conference morning tea, 120 guests',
    description: 'Mini croissants, friands and fruit loaf for a two-day conference.',
    stage: 'quoted',
    quotedAmount: 1450,
  },
  {
    client: 'reef-cafe',
    title: 'Weekly wholesale order',
    description: 'Twenty sourdough loaves and forty croissants a day, Monday to Saturday.',
    stage: 'in_progress',
    quotedAmount: 2100,
  },
  {
    client: 'school-fete',
    title: 'Spring fete bread rolls',
    description: '400 rolls for the sausage sizzle.',
    stage: 'lead',
    quotedAmount: null,
  },
] as const;

export const DEMO_TODOS = [
  { title: 'Book the deck oven service', priority: 'high', client: null },
  {
    title: 'Send the conference quote to the Esplanade Hotel',
    priority: 'high',
    client: 'esplanade-hotel',
  },
  { title: 'Calibrate the probe thermometer', priority: 'medium', client: null },
  { title: 'Reply to the P&C about fete rolls', priority: 'low', client: 'school-fete' },
] as const;

/** Files visitors can download from the inbox and upload themselves. */
export const SAMPLE_UPLOADS = [
  'new-oven-sop.md',
  'flour-price-update.md',
  'casual-staff-induction.md',
] as const;
