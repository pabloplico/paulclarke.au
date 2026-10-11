// ── Types ──────────────────────────────────────────────────────────────────────

export type Industry =
  | 'trades'
  | 'hospitality'
  | 'retail'
  | 'professional-services'
  | 'health'
  | 'real-estate'
  | 'logistics';

/** Aligned with the Responsible AI Index (Fifth Quadrant / NAIC) maturity levels */
export type MaturityLevel = 'emerging' | 'developing' | 'implementing' | 'leading';

export type PainPointId =
  | 'admin-overload'
  | 'customer-response-time'
  | 'quoting-estimating'
  | 'scheduling-coordination'
  | 'staff-onboarding'
  | 'marketing-content'
  | 'financial-reporting'
  | 'compliance-documentation'
  | 'inventory-management'
  | 'lead-followup';

/**
 * Five assessment dimensions that map to Australian AI frameworks:
 *
 * 1. Strategy & Leadership    → NAIC AI6 #1 (Accountability)
 * 2. People & Skills          → NAIC AI6 #6 (Human Control)
 * 3. Data & Infrastructure    → NAIC AI6 #3 (Measure & Manage Risks)
 * 4. Governance & Trust       → NAIC AI6 #2, #4 (Understand Impacts, Share Info)
 * 5. Implementation & Value   → NAIC AI6 #5 (Test & Monitor)
 */
export type ReadinessDimension =
  | 'strategy-leadership'
  | 'people-skills'
  | 'data-infrastructure'
  | 'governance-trust'
  | 'implementation-value';

export type ReadinessLevel = 'emerging' | 'developing' | 'implementing' | 'leading';

export type RecommendationCategory = 'quick-win' | 'next-step' | 'strategic';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface DimensionQuestion {
  id: string;
  dimension: ReadinessDimension;
  keyword: string;
  maxStars: 4;
}

export interface AI6Practice {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  description: string;
  url: string;
  track: 1 | 2;
}

export interface FrameworkReference {
  id: string;
  name: string;
  shortName: string;
  url: string;
}

export interface DimensionMeta {
  id: ReadinessDimension;
  label: string;
  shortLabel: string;
  ai6Practices: (1 | 2 | 3 | 4 | 5 | 6)[];
}

export interface DimensionScore {
  dimension: ReadinessDimension;
  label: string;
  score: number;
  level: ReadinessLevel;
  feedback: string;
  ai6Practices: AI6Practice[];
}

export interface ReadinessLevelMeta {
  id: ReadinessLevel;
  label: string;
  range: [number, number];
  description: string;
  benchmark: string;
  naicTrack: 1 | 2;
}

export interface AssessmentProfile {
  industry: Industry | null;

  maturityLevel: MaturityLevel | null;
  painPoints: PainPointId[];
  dimensionAnswers: Record<string, number>;
}

export interface RecommendationCard {
  id: string;
  category: RecommendationCategory;
  title: string;
  body: string;
  industries: Industry[];
  painPoints: PainPointId[];
  maturityLevels: MaturityLevel[];
  dimensions: ReadinessDimension[];
  ai6Practices: (1 | 2 | 3 | 4 | 5 | 6)[];
  timeToValue?: string;
  estimatedSaving?: string;
  source?: string;
  sourceUrl?: string;
  badge?: string;
}

export interface ScoredRecommendation extends RecommendationCard {
  score: number;
}

export interface IndustryBenchmark {
  id: string;
  industry: Industry;
  stat: string;
  body: string;
  source: string;
  sourceUrl: string;
}

export interface AssessmentResults {
  overallScore: number;
  overallLevel: ReadinessLevel;
  dimensionScores: DimensionScore[];
  naicTrack: 1 | 2;
  quickWins: ScoredRecommendation[];
  nextSteps: ScoredRecommendation[];
  strategicActions: ScoredRecommendation[];
  topOpportunities: ScoredRecommendation[];
  benchmarks: IndustryBenchmark[];
  frameworkReferences: FrameworkReference[];
}

// ── Static Data ────────────────────────────────────────────────────────────────

export const INDUSTRIES: { id: Industry; label: string }[] = [
  { id: 'trades', label: 'Trades & Construction' },
  { id: 'hospitality', label: 'Hospitality & Food' },
  { id: 'retail', label: 'Retail & E-Commerce' },
  { id: 'professional-services', label: 'Professional Services' },
  { id: 'health', label: 'Health & Wellness' },
  { id: 'real-estate', label: 'Real Estate' },
  { id: 'logistics', label: 'Logistics & Transport' },
];

export const MATURITY_LEVELS: { id: MaturityLevel; label: string; description: string }[] = [
  { id: 'emerging', label: 'Emerging', description: "Haven't used AI tools in the business" },
  {
    id: 'developing',
    label: 'Developing',
    description: 'Some staff use ChatGPT or similar informally',
  },
  {
    id: 'implementing',
    label: 'Implementing',
    description: 'Trialling AI tools in specific workflows',
  },
  { id: 'leading', label: 'Leading', description: 'AI is embedded in core business processes' },
];

export const PAIN_POINTS: { id: PainPointId; label: string }[] = [
  { id: 'admin-overload', label: 'Admin & paperwork overload' },
  { id: 'customer-response-time', label: 'Slow customer response times' },
  { id: 'quoting-estimating', label: 'Quoting & estimating takes too long' },
  { id: 'scheduling-coordination', label: 'Scheduling & coordination gaps' },
  { id: 'staff-onboarding', label: 'Staff onboarding is slow' },
  { id: 'marketing-content', label: 'Marketing content is a struggle' },
  { id: 'financial-reporting', label: 'Financial reporting is manual' },
  { id: 'compliance-documentation', label: 'Compliance & documentation burden' },
  { id: 'inventory-management', label: 'Inventory tracking headaches' },
  { id: 'lead-followup', label: 'Leads slip through the cracks' },
];

// ── NAIC AI6 Practices ────────────────────────────────────────────────────────

export const AI6_PRACTICES: AI6Practice[] = [
  {
    id: 1,
    name: 'Decide Who Is Accountable',
    description: 'Assign clear responsibility for AI decisions and outcomes in your business.',
    url: 'https://www.industry.gov.au/publications/guidance-for-ai-adoption',
    track: 1,
  },
  {
    id: 2,
    name: 'Understand Impacts and Plan Accordingly',
    description: 'Assess how AI will affect your customers, staff, and community before deploying.',
    url: 'https://www.industry.gov.au/publications/guidance-for-ai-adoption',
    track: 1,
  },
  {
    id: 3,
    name: 'Measure and Manage Risks',
    description: 'Identify and mitigate AI-specific risks to your data, privacy, and operations.',
    url: 'https://www.industry.gov.au/publications/guidance-for-ai-adoption',
    track: 1,
  },
  {
    id: 4,
    name: 'Share Essential Information',
    description: 'Be transparent with customers and staff about when and how AI is used.',
    url: 'https://www.industry.gov.au/publications/guidance-for-ai-adoption',
    track: 1,
  },
  {
    id: 5,
    name: 'Test and Monitor',
    description: 'Evaluate AI tool performance and monitor outputs on an ongoing basis.',
    url: 'https://www.industry.gov.au/publications/guidance-for-ai-adoption',
    track: 2,
  },
  {
    id: 6,
    name: 'Maintain Human Control',
    description:
      'Keep humans in the loop for important decisions — AI should assist, not replace judgement.',
    url: 'https://www.industry.gov.au/publications/guidance-for-ai-adoption',
    track: 2,
  },
];

// ── Framework References ──────────────────────────────────────────────────────

export const FRAMEWORK_REFERENCES: FrameworkReference[] = [
  {
    id: 'naic-ai6',
    name: 'Guidance for AI Adoption — AI6 Practices',
    shortName: 'NAIC AI6',
    url: 'https://www.industry.gov.au/publications/guidance-for-ai-adoption',
  },
  {
    id: 'ai-impact-navigator',
    name: 'AI Impact Navigator',
    shortName: 'AI Impact Navigator',
    url: 'https://www.industry.gov.au/publications/ai-impact-navigator',
  },
  {
    id: 'rai-index',
    name: 'Australian Responsible AI Index',
    shortName: 'RAI Index',
    url: 'https://www.fifthquadrant.com.au/responsible-ai-index-2024',
  },
  {
    id: 'ai-ethics',
    name: "Australia's AI Ethics Principles",
    shortName: 'AI Ethics Principles',
    url: 'https://www.industry.gov.au/publications/australias-artificial-intelligence-ethics-framework',
  },
  {
    id: 'vaiss',
    name: 'Voluntary AI Safety Standard',
    shortName: 'VAISS',
    url: 'https://www.industry.gov.au/publications/voluntary-ai-safety-standard',
  },
];

// ── Dimensions ────────────────────────────────────────────────────────────────

export const DIMENSIONS: DimensionMeta[] = [
  {
    id: 'strategy-leadership',
    label: 'Strategy & Leadership',
    shortLabel: 'Strategy',
    ai6Practices: [1],
  },
  {
    id: 'people-skills',
    label: 'People & Skills',
    shortLabel: 'People',
    ai6Practices: [6],
  },
  {
    id: 'data-infrastructure',
    label: 'Data & Infrastructure',
    shortLabel: 'Data',
    ai6Practices: [3],
  },
  {
    id: 'governance-trust',
    label: 'Governance & Trust',
    shortLabel: 'Governance',
    ai6Practices: [2, 4],
  },
  {
    id: 'implementation-value',
    label: 'Implementation & Value',
    shortLabel: 'Implementation',
    ai6Practices: [5],
  },
];

// ── Readiness Levels ──────────────────────────────────────────────────────────

/** Look up a readiness level's metadata. Every ReadinessLevel has an entry in READINESS_LEVELS. */
export function getReadinessLevelMeta(id: ReadinessLevel): ReadinessLevelMeta {
  const meta = READINESS_LEVELS.find((l) => l.id === id);
  if (!meta) throw new Error(`Missing READINESS_LEVELS entry for "${id}"`);
  return meta;
}

export const READINESS_LEVELS: ReadinessLevelMeta[] = [
  {
    id: 'emerging',
    label: 'Emerging',
    range: [0, 25],
    description:
      'Your business is at the start of its AI journey. Focus on foundations \u2014 understanding where AI fits and building basic digital capabilities.',
    benchmark: '17% of Australian businesses are at this level (RAI Index 2025)',
    naicTrack: 1,
  },
  {
    id: 'developing',
    label: 'Developing',
    range: [26, 50],
    description:
      'You have some AI awareness and early experiments. Now is the time to formalise your approach and build team capability.',
    benchmark: '48% of Australian businesses are at this level (RAI Index 2025)',
    naicTrack: 1,
  },
  {
    id: 'implementing',
    label: 'Implementing',
    range: [51, 75],
    description:
      'AI is becoming part of how your business operates. Focus on governance, measuring impact, and scaling what works.',
    benchmark: '23% of Australian businesses are at this level (RAI Index 2025)',
    naicTrack: 2,
  },
  {
    id: 'leading',
    label: 'Leading',
    range: [76, 100],
    description:
      'Your business is ahead of the curve. Maintain your edge with advanced integrations, continuous improvement, and responsible AI practices.',
    benchmark: '12% of Australian businesses are at this level (RAI Index 2025)',
    naicTrack: 2,
  },
];

// ── Dimension Questions ───────────────────────────────────────────────────────

export const DIMENSION_QUESTIONS: DimensionQuestion[] = [
  // Strategy & Leadership
  { id: 'sl-1', dimension: 'strategy-leadership', keyword: 'Decision Ownership', maxStars: 4 },
  { id: 'sl-2', dimension: 'strategy-leadership', keyword: 'Opportunity Mapping', maxStars: 4 },
  // People & Skills
  { id: 'ps-1', dimension: 'people-skills', keyword: 'Team Confidence', maxStars: 4 },
  { id: 'ps-2', dimension: 'people-skills', keyword: 'Usage Policy', maxStars: 4 },
  // Data & Infrastructure
  { id: 'di-1', dimension: 'data-infrastructure', keyword: 'Data Organisation', maxStars: 4 },
  { id: 'di-2', dimension: 'data-infrastructure', keyword: 'Data Security', maxStars: 4 },
  // Governance & Trust
  { id: 'gt-1', dimension: 'governance-trust', keyword: 'Error Handling', maxStars: 4 },
  { id: 'gt-2', dimension: 'governance-trust', keyword: 'AI Transparency', maxStars: 4 },
  // Implementation & Value
  { id: 'iv-1', dimension: 'implementation-value', keyword: 'AI Adoption', maxStars: 4 },
  { id: 'iv-2', dimension: 'implementation-value', keyword: 'Impact Measurement', maxStars: 4 },
];

// ── Industry Benchmarks ───────────────────────────────────────────────────────

export const INDUSTRY_BENCHMARKS: IndustryBenchmark[] = [
  {
    id: 'bm-trades',
    industry: 'trades',
    stat: '26–36% of time reclaimed in text-heavy business functions',
    body: 'BCG analysis of communications teams found GenAI can reclaim 26–36% of function time today, with higher upside from process transformation. Time savings are role- and workflow-dependent — most defensible in document-heavy functions.',
    source: 'Boston Consulting Group — The GenAI Transformation of the Communications Function',
    sourceUrl:
      'https://media-publications.bcg.com/The-GenAI-Transformation-of-the-CommunicationsFunction.pdf',
  },
  {
    id: 'bm-hospitality',
    industry: 'hospitality',
    stat: 'Deposits cut no-show rates by 57% on average',
    body: 'OpenTable data shows credit-card holds make guests up to 16% less likely to no-show, while requiring deposits cuts no-show rates by 57% on average. AI-powered booking management can automate these policies at scale.',
    source: 'OpenTable — 3 Proven Payment Strategies to Reduce No-Shows',
    sourceUrl:
      'https://www.opentable.com/restaurant-solutions/resources/3-proven-payment-strategies-reduce-no-shows/',
  },
  {
    id: 'bm-retail',
    industry: 'retail',
    stat: '47% of retailers in AI assessment/trial phase',
    body: 'An NVIDIA-sponsored retail and CPG survey found 47% of companies are in the AI assessment phase (trials, pilots, and evaluations), while a further 42% are already actively using AI — meaning 89% have engaged with AI in some form.',
    source: 'NVIDIA — State of AI in Retail Report 2025',
    sourceUrl:
      'https://www.hkt-enterprise.com/resources/Cases/retail-report-state-of-ai-report-2025.pdf',
  },
  {
    id: 'bm-professional-services',
    industry: 'professional-services',
    stat: 'Average small business worker saves 5.6 hrs/week with AI',
    body: 'A 2026 US SMB survey of 1,009 workers found AI saves an average of 5.6 hours per week, with managers reporting 7.2 hours saved versus 3.4 hours for individual contributors. A separate LSE/Protiviti global study found professionals save an average of 7.5 hours per week.',
    source:
      '2026 Small Business AI Outlook Report (business.com / US SMB survey, n=1,009) + LSE/Protiviti Global AI Productivity Survey',
    sourceUrl: 'https://www.business.com/articles/ai-usage-smb-workplace-study/',
  },
  {
    id: 'bm-health',
    industry: 'health',
    stat: '33% reduction in documentation time (AI scribe, allied health)',
    body: 'A peer-reviewed Australian study of 119 allied health professionals found significant reductions in note-writing and out-of-hours documentation, with productivity increasing by an average of 5.8%. Individual clinicians in qualitative interviews reported saving approximately 30–45 minutes per day.',
    source:
      'Evans et al. (2025), Musculoskeletal Science and Practice — Australian allied health AI scribe study (PubMed 40328004)',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/40328004/',
  },
  {
    id: 'bm-real-estate',
    industry: 'real-estate',
    stat: '40% faster first response to inbound leads',
    body: 'An iTelaSoft case study of an Australian mortgage broker found average first response time to potential customers reduced by 40% after implementing AI-assisted lead distribution. Separately, a Homeflow study found the average agent takes nearly 4 business hours to respond — making speed a critical differentiator.',
    source: 'iTelaSoft — AI Lead Distribution Case Study (Australian)',
    sourceUrl: 'https://www.itelasoft.com.au/case-studies/aI-lead-distribution',
  },
  {
    id: 'bm-logistics',
    industry: 'logistics',
    stat: '~12.5% fuel savings under optimised conditions',
    body: 'A US Department of Energy eco-routing study found the best-case scenario achieves 12.5% average fuel savings under ideal assumptions. A Sydney-based vehicle routing optimisation case study found an 11% reduction in fuel consumption alongside a 10% distance reduction. Real-world results vary based on baseline routing quality and fleet constraints.',
    source:
      'US Alternative Fuels Data Center eco-routing evaluation + Sydney fleet VRP case study (ResearchGate)',
    sourceUrl: 'https://afdc.energy.gov/files/u/publication/navigation_api_route_fuel_saving.pdf',
  },
];

// ── Recommendation Cards ──────────────────────────────────────────────────────

export const RECOMMENDATION_CARDS: RecommendationCard[] = [
  // ── Quick Wins ─────────────────────────────────────────────────────────────
  // ── Emerging / Developing Quick Wins ──
  {
    id: 'qw-ai-inbox',
    category: 'quick-win',
    title: 'AI-assisted email triage',
    body: 'Use AI to draft replies, sort enquiries by urgency, and flag quotes needing follow-up. Workers spend an estimated 28% of their workweek on email (McKinsey); AI tools can recover a meaningful portion of that time for revenue-generating work.',
    industries: [],
    painPoints: ['admin-overload', 'customer-response-time', 'lead-followup'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['implementation-value'],
    ai6Practices: [5],
    timeToValue: '1\u20132 weeks',
    estimatedSaving: 'Portion of ~11 hrs/week currently spent on email',
    source: 'McKinsey Global Institute — The Social Economy (2012)',
    sourceUrl:
      'https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/the-social-economy',
  },
  {
    id: 'qw-quote-templates',
    category: 'quick-win',
    title: 'Smart quoting with AI templates',
    body: 'AI-assisted quoting tools can significantly reduce quote turnaround time. One Australian quoting tool reports reductions from 2–4 hours to 30–45 minutes per RFQ. Results depend on quote complexity and existing workflow.',
    industries: ['trades', 'professional-services', 'real-estate'],
    painPoints: ['quoting-estimating', 'admin-overload'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['implementation-value'],
    ai6Practices: [5, 6],
    timeToValue: '1\u20132 weeks',
    estimatedSaving: 'Significant reduction in quote turnaround',
    source: 'Drilledger — AI Quote Generator (Australian vendor)',
    sourceUrl: 'https://www.drilledger.com.au/demo/quote-generator',
  },
  {
    id: 'qw-chatbot-faq',
    category: 'quick-win',
    title: 'FAQ chatbot for your website',
    body: 'Deploy a simple AI chatbot trained on your FAQs to handle common enquiries 24/7 \u2014 booking requests, menu questions, opening hours.',
    industries: ['hospitality', 'retail', 'health', 'real-estate'],
    painPoints: ['customer-response-time', 'lead-followup'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['implementation-value', 'governance-trust'],
    ai6Practices: [4, 5],
    timeToValue: '2\u20134 weeks',
    estimatedSaving: '37% faster responses',
    source: 'Gorgias — Automation Impact on CX Data (14,000+ merchants)',
    sourceUrl: 'https://www.gorgias.com/blog/automation-impact-on-cx-data',
  },
  {
    id: 'qw-roster-optimiser',
    category: 'quick-win',
    title: 'AI-assisted roster scheduling',
    body: 'Professionals spend roughly 3 hours per week managing meeting logistics (Reclaim.ai). Automated scheduling tools eliminate most of this back-and-forth entirely.',
    industries: ['hospitality', 'retail', 'health', 'logistics'],
    painPoints: ['scheduling-coordination', 'admin-overload'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['implementation-value', 'data-infrastructure'],
    ai6Practices: [5, 6],
    timeToValue: '2\u20134 weeks',
    estimatedSaving: '~3 hrs/week on meeting coordination',
    source: 'Reclaim.ai — Smart Meetings Trends Report',
    sourceUrl: 'https://reclaim.ai/blog/smart-meetings-report',
  },
  {
    id: 'qw-social-content',
    category: 'quick-win',
    title: 'AI-powered social media content',
    body: 'Adobe research shows marketers expect content demand to grow 5x by 2027. AI tools are the primary lever for meeting that demand — with case studies like Zalando reporting campaign production time dropping from weeks to days using generative AI.',
    industries: [],
    painPoints: ['marketing-content'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['implementation-value'],
    ai6Practices: [5],
    timeToValue: '1 week',
    estimatedSaving: 'Significant time reduction per content piece',
    source: 'Adobe — 71% of Marketers Say Content Demand to Increase 5x (AU)',
    sourceUrl:
      'https://business.adobe.com/au/blog/71-percent-of-marketers-say-content-demand-to-increase-5x',
  },
  {
    id: 'qw-onboarding-docs',
    category: 'quick-win',
    title: 'Auto-generate onboarding materials',
    body: 'Turn existing SOPs and notes into structured onboarding checklists, training guides, and role summaries using AI.',
    industries: [],
    painPoints: ['staff-onboarding', 'compliance-documentation'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['people-skills', 'implementation-value'],
    ai6Practices: [5, 6],
    timeToValue: '1\u20132 weeks',
    estimatedSaving: '2\u20133 hrs/new hire',
  },
  {
    id: 'qw-receipt-capture',
    category: 'quick-win',
    title: 'AI receipt and invoice capture',
    body: 'Photograph receipts and invoices \u2014 AI extracts amounts, GST, categories, and pushes data to your accounting software.',
    industries: ['trades', 'retail', 'logistics'],
    painPoints: ['financial-reporting', 'admin-overload'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['data-infrastructure', 'implementation-value'],
    ai6Practices: [3, 5],
    timeToValue: '1\u20132 weeks',
    estimatedSaving: '3\u20135 hrs/week',
  },
  {
    id: 'qw-compliance-checklist',
    category: 'quick-win',
    title: 'AI compliance checklist generator',
    body: 'Input your industry and scope \u2014 AI produces tailored compliance checklists cross-referenced against current QLD regulations.',
    industries: ['trades', 'health', 'professional-services'],
    painPoints: ['compliance-documentation'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['governance-trust', 'implementation-value'],
    ai6Practices: [2, 5],
    timeToValue: '1 week',
    estimatedSaving: '4\u20136 hrs/audit',
  },
  {
    id: 'qw-inventory-alerts',
    category: 'quick-win',
    title: 'Predictive inventory alerts',
    body: 'AI analyses sales patterns and seasonal trends to predict when stock will run low, reducing both stockouts and overordering.',
    industries: ['retail', 'hospitality', 'logistics'],
    painPoints: ['inventory-management'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['data-infrastructure', 'implementation-value'],
    ai6Practices: [5],
    timeToValue: '3\u20134 weeks',
  },
  {
    id: 'qw-property-descriptions',
    category: 'quick-win',
    title: 'AI property listing descriptions',
    body: 'Generate compelling property descriptions from dot-point features and photos. Consistent quality across your whole portfolio.',
    industries: ['real-estate'],
    painPoints: ['marketing-content', 'admin-overload'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['implementation-value'],
    ai6Practices: [5],
    timeToValue: '1 week',
  },

  // ── Implementing Quick Wins ──
  {
    id: 'qw-workflow-audit',
    category: 'quick-win',
    title: 'Audit your AI tool stack for overlap',
    body: 'Map every AI tool in use across the business. Identify redundancy, consolidate where possible, and flag ungoverned shadow AI.',
    industries: [],
    painPoints: ['admin-overload', 'compliance-documentation'],
    maturityLevels: ['implementing'],
    dimensions: ['strategy-leadership', 'governance-trust'],
    ai6Practices: [1, 4],
    timeToValue: '1\u20132 weeks',
    estimatedSaving: '2\u20134 hrs/month',
  },
  {
    id: 'qw-prompt-standardise',
    category: 'quick-win',
    title: 'Standardise prompts across your team',
    body: 'Create versioned prompt templates for key workflows. Reduce output inconsistency and make it easy to onboard new team members to AI tools.',
    industries: [],
    painPoints: ['staff-onboarding', 'admin-overload', 'marketing-content'],
    maturityLevels: ['implementing'],
    dimensions: ['people-skills', 'implementation-value'],
    ai6Practices: [5, 6],
    timeToValue: '1\u20132 weeks',
    estimatedSaving: '30% less rework',
  },
  {
    id: 'qw-output-quality',
    category: 'quick-win',
    title: 'Set up AI output quality checks',
    body: 'Define review criteria for AI-generated content before it reaches customers. Spot-check accuracy, tone, and compliance weekly.',
    industries: [],
    painPoints: ['compliance-documentation', 'customer-response-time'],
    maturityLevels: ['implementing'],
    dimensions: ['governance-trust', 'implementation-value'],
    ai6Practices: [5, 6],
    timeToValue: '1 week',
    estimatedSaving: '50% fewer errors',
  },
  {
    id: 'qw-trades-job-ai-pipeline',
    category: 'quick-win',
    title: 'Automate the quote-to-invoice pipeline',
    body: 'Connect your quoting, scheduling, and invoicing tools so AI flows data between them. Eliminate double-entry from site to office.',
    industries: ['trades'],
    painPoints: ['quoting-estimating', 'admin-overload', 'financial-reporting'],
    maturityLevels: ['implementing'],
    dimensions: ['data-infrastructure', 'implementation-value'],
    ai6Practices: [5],
    timeToValue: '3\u20134 weeks',
    estimatedSaving: '8\u201312 hrs/week',
  },
  {
    id: 'qw-hospo-demand-forecasting',
    category: 'quick-win',
    title: 'AI demand forecasting for staffing and stock',
    body: 'Use historical sales, weather, and event data to predict busy periods. Automatically adjust roster suggestions and supplier orders.',
    industries: ['hospitality', 'retail'],
    painPoints: ['scheduling-coordination', 'inventory-management'],
    maturityLevels: ['implementing'],
    dimensions: ['data-infrastructure', 'implementation-value'],
    ai6Practices: [5],
    timeToValue: '3\u20134 weeks',
    estimatedSaving: '15\u201320% less waste',
  },
  {
    id: 'qw-professional-client-insights',
    category: 'quick-win',
    title: 'AI-powered client insight summaries',
    body: 'Automatically compile client history, communication patterns, and engagement metrics into pre-meeting briefs. Walk in prepared, every time.',
    industries: ['professional-services', 'real-estate'],
    painPoints: ['customer-response-time', 'lead-followup'],
    maturityLevels: ['implementing'],
    dimensions: ['implementation-value', 'data-infrastructure'],
    ai6Practices: [5],
    timeToValue: '2\u20133 weeks',
    estimatedSaving: '20 min/meeting',
  },
  {
    id: 'qw-health-compliance-monitoring',
    category: 'quick-win',
    title: 'Continuous compliance monitoring with AI',
    body: 'Set up AI to scan regulatory updates, flag changes relevant to your practice, and update compliance checklists automatically.',
    industries: ['health', 'professional-services'],
    painPoints: ['compliance-documentation'],
    maturityLevels: ['implementing'],
    dimensions: ['governance-trust'],
    ai6Practices: [2, 3],
    timeToValue: '2\u20134 weeks',
  },
  {
    id: 'qw-logistics-route-optimisation',
    category: 'quick-win',
    title: 'AI route and dispatch optimisation',
    body: 'Optimise delivery routes and dispatch scheduling using real-time traffic, order priority, and driver availability data.',
    industries: ['logistics', 'trades'],
    painPoints: ['scheduling-coordination', 'admin-overload'],
    maturityLevels: ['implementing'],
    dimensions: ['implementation-value', 'data-infrastructure'],
    ai6Practices: [5],
    timeToValue: '3\u20134 weeks',
    estimatedSaving: '20\u201330% fewer kms',
  },

  // ── Leading Quick Wins ──
  {
    id: 'qw-ai-benchmarking',
    category: 'quick-win',
    title: 'Benchmark AI ROI across workflows',
    body: 'Quantify the return on each AI-assisted workflow. Compare time saved, error rates, and revenue impact to prioritise further investment.',
    industries: [],
    painPoints: ['admin-overload', 'financial-reporting'],
    maturityLevels: ['leading'],
    dimensions: ['implementation-value', 'strategy-leadership'],
    ai6Practices: [5],
    timeToValue: '2\u20133 weeks',
  },
  {
    id: 'qw-competitive-scan',
    category: 'quick-win',
    title: 'Run an AI competitive analysis',
    body: 'Map how competitors and industry leaders are deploying AI. Identify capability gaps and emerging opportunities to stay ahead.',
    industries: [],
    painPoints: ['lead-followup', 'marketing-content'],
    maturityLevels: ['leading'],
    dimensions: ['strategy-leadership'],
    ai6Practices: [1],
    timeToValue: '1\u20132 weeks',
  },
  {
    id: 'qw-ethics-review',
    category: 'quick-win',
    title: 'Conduct an AI ethics review',
    body: 'Audit all customer-facing AI against the Australian AI Ethics Principles. Document findings, remediate gaps, and publish your approach.',
    industries: [],
    painPoints: ['compliance-documentation', 'customer-response-time'],
    maturityLevels: ['leading'],
    dimensions: ['governance-trust'],
    ai6Practices: [2, 4],
    timeToValue: '2\u20134 weeks',
    badge: 'AI Ethics',
  },
  {
    id: 'qw-trades-predictive-maintenance',
    category: 'quick-win',
    title: 'Predictive maintenance scheduling',
    body: 'Use AI to analyse equipment and job history to predict when assets need servicing. Prevent costly breakdowns and schedule proactively.',
    industries: ['trades', 'logistics'],
    painPoints: ['scheduling-coordination'],
    maturityLevels: ['leading'],
    dimensions: ['data-infrastructure', 'implementation-value'],
    ai6Practices: [5],
    timeToValue: '4\u20136 weeks',
  },
  {
    id: 'qw-hospo-dynamic-pricing',
    category: 'quick-win',
    title: 'AI-driven dynamic pricing',
    body: 'Automatically adjust pricing based on demand patterns, competitor rates, and seasonal trends. Maximise margin without manual guesswork.',
    industries: ['hospitality', 'retail', 'real-estate'],
    painPoints: ['financial-reporting'],
    maturityLevels: ['leading'],
    dimensions: ['strategy-leadership', 'implementation-value'],
    ai6Practices: [5],
    timeToValue: '4\u20136 weeks',
  },
  {
    id: 'qw-professional-ai-client-portal',
    category: 'quick-win',
    title: 'Build an AI-enhanced client portal',
    body: 'Give clients self-service access to AI-generated reports, status updates, and insights. Reduce inbound queries and increase perceived value.',
    industries: ['professional-services', 'health'],
    painPoints: ['customer-response-time', 'admin-overload'],
    maturityLevels: ['leading'],
    dimensions: ['implementation-value', 'governance-trust'],
    ai6Practices: [4, 5],
    timeToValue: '4\u20138 weeks',
  },

  // ── Next Steps (1\u20133 months) ────────────────────────────────────────────────
  {
    id: 'ns-accountability',
    category: 'next-step',
    title: 'Assign an AI champion in your business',
    body: 'Designate someone to own AI decisions \u2014 tool selection, usage guidelines, and monitoring. The NAIC recommends this as the first step in responsible AI adoption.',
    industries: [],
    painPoints: [],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['strategy-leadership'],
    ai6Practices: [1],
    timeToValue: '1 week',
    badge: 'AI6 Practice #1',
  },
  {
    id: 'ns-usage-guidelines',
    category: 'next-step',
    title: 'Create basic AI usage guidelines for staff',
    body: "Write a one-page guide covering: approved tools, what data can be shared with AI, what needs human review. Use the NAIC's AI Policy Template as a starting point.",
    industries: [],
    painPoints: [],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['people-skills', 'governance-trust'],
    ai6Practices: [4, 6],
    timeToValue: '1\u20132 weeks',
    badge: 'AI6 Practice #4',
  },
  {
    id: 'ns-data-audit',
    category: 'next-step',
    title: 'Audit your data readiness',
    body: 'Map where your business data lives, how it flows between systems, and whether it meets the quality AI tools need. Centralise key data into one or two connected systems.',
    industries: [],
    painPoints: ['admin-overload', 'financial-reporting', 'inventory-management'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['data-infrastructure'],
    ai6Practices: [3],
    timeToValue: '2\u20134 weeks',
    badge: 'AI6 Practice #3',
  },
  {
    id: 'ns-impact-assessment',
    category: 'next-step',
    title: 'Run a basic AI impact assessment',
    body: 'Before expanding AI use, assess the risks: could it affect customer privacy? Employment? Use the NAIC AI Screening Tool to flag higher-risk use cases.',
    industries: [],
    painPoints: ['compliance-documentation'],
    maturityLevels: ['developing', 'implementing'],
    dimensions: ['governance-trust'],
    ai6Practices: [2, 3],
    timeToValue: '1\u20132 weeks',
    badge: 'AI6 Practice #2',
  },
  {
    id: 'ns-prompt-library',
    category: 'next-step',
    title: 'Build a shared prompt library',
    body: "Formalise what's working \u2014 collect your team's best AI prompts into a shared doc. Standardise outputs and reduce inconsistency across the business.",
    industries: [],
    painPoints: ['admin-overload', 'marketing-content', 'customer-response-time'],
    maturityLevels: ['developing', 'implementing'],
    dimensions: ['people-skills', 'implementation-value'],
    ai6Practices: [5, 6],
    timeToValue: '1\u20132 weeks',
  },
  {
    id: 'ns-ai-register',
    category: 'next-step',
    title: 'Start an AI register',
    body: 'Track all the AI tools your business uses: what they do, what data they access, who oversees them. The NAIC provides a free template for this.',
    industries: [],
    painPoints: [],
    maturityLevels: ['developing', 'implementing'],
    dimensions: ['governance-trust', 'strategy-leadership'],
    ai6Practices: [1, 4],
    timeToValue: '1 week',
    badge: 'AI6 Practice #1',
  },
  {
    id: 'ns-measure-roi',
    category: 'next-step',
    title: 'Set up AI ROI tracking',
    body: 'Pick 2\u20133 AI-assisted workflows and measure before/after: time spent, error rates, customer response times. You need data to decide what to scale.',
    industries: [],
    painPoints: [],
    maturityLevels: ['developing', 'implementing'],
    dimensions: ['implementation-value'],
    ai6Practices: [5],
    timeToValue: '2\u20134 weeks',
    badge: 'AI6 Practice #5',
  },

  // ── Implementing / Leading Next Steps ──
  {
    id: 'ns-cross-functional-ai',
    category: 'next-step',
    title: 'Establish cross-functional AI workflows',
    body: 'Break down silos — connect AI outputs from sales, ops, and finance into shared dashboards. Eliminate duplicate data entry across teams.',
    industries: [],
    painPoints: ['admin-overload', 'scheduling-coordination'],
    maturityLevels: ['implementing', 'leading'],
    dimensions: ['data-infrastructure', 'implementation-value'],
    ai6Practices: [3, 5],
    timeToValue: '4\u20138 weeks',
  },
  {
    id: 'ns-ai-risk-register',
    category: 'next-step',
    title: 'Build a formal AI risk register',
    body: 'Document each AI system, its risk profile, data dependencies, and fallback procedures. Required for NAIC Implementation Practices alignment.',
    industries: [],
    painPoints: ['compliance-documentation'],
    maturityLevels: ['implementing', 'leading'],
    dimensions: ['governance-trust', 'strategy-leadership'],
    ai6Practices: [2, 3],
    timeToValue: '2\u20134 weeks',
    badge: 'Implementation Practices',
  },
  {
    id: 'ns-vendor-evaluation',
    category: 'next-step',
    title: 'Create an AI vendor evaluation framework',
    body: 'Standardise how you assess new AI tools: data sovereignty, security, integration capability, and alignment with Australian privacy law.',
    industries: [],
    painPoints: [],
    maturityLevels: ['implementing', 'leading'],
    dimensions: ['governance-trust', 'data-infrastructure'],
    ai6Practices: [3, 4],
    timeToValue: '2\u20133 weeks',
  },
  {
    id: 'ns-advanced-training',
    category: 'next-step',
    title: 'Run role-specific AI training programs',
    body: 'Move beyond general awareness. Train each role on the AI tools and techniques most relevant to their daily work, with hands-on exercises.',
    industries: [],
    painPoints: ['staff-onboarding'],
    maturityLevels: ['implementing', 'leading'],
    dimensions: ['people-skills'],
    ai6Practices: [6],
    timeToValue: '4\u20138 weeks',
  },

  // ── Strategic (3\u20136+ months) ─────────────────────────────────────────────────
  {
    id: 'st-digitise-workflows',
    category: 'strategic',
    title: 'Digitise your core workflows',
    body: 'Before AI can help, your key processes need to be digital. Move paper-based quoting, scheduling, and record-keeping into connected software over the next quarter.',
    industries: [],
    painPoints: ['admin-overload', 'quoting-estimating', 'financial-reporting'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['data-infrastructure', 'implementation-value'],
    ai6Practices: [3, 5],
    timeToValue: '2\u20133 months',
  },
  {
    id: 'st-ai-roadmap',
    category: 'strategic',
    title: 'Set a 6-month AI roadmap for your business',
    body: 'Map your top 5 time-consuming workflows, rank them by AI potential, and set quarterly milestones. Having a plan prevents ad-hoc tool adoption and wasted spend.',
    industries: [],
    painPoints: ['admin-overload', 'scheduling-coordination'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['strategy-leadership'],
    ai6Practices: [1],
    timeToValue: '1\u20132 months',
  },
  {
    id: 'st-team-ai-literacy',
    category: 'strategic',
    title: 'Build basic AI literacy across your team',
    body: 'Run a structured program to get every team member comfortable with AI fundamentals \u2014 what it can do, where it falls short, and how to use it safely in your business.',
    industries: [],
    painPoints: ['staff-onboarding'],
    maturityLevels: ['emerging', 'developing'],
    dimensions: ['people-skills', 'governance-trust'],
    ai6Practices: [6, 4],
    timeToValue: '2\u20133 months',
  },
  {
    id: 'st-custom-integrations',
    category: 'strategic',
    title: 'Connect AI to your core business systems',
    body: 'Integrate AI tools with your CRM, accounting, or booking software. Automate data flows between systems so AI works with live, accurate data.',
    industries: [],
    painPoints: ['admin-overload', 'scheduling-coordination', 'inventory-management'],
    maturityLevels: ['implementing', 'leading'],
    dimensions: ['data-infrastructure', 'implementation-value'],
    ai6Practices: [3, 5],
    timeToValue: '2\u20133 months',
  },
  {
    id: 'st-governance-framework',
    category: 'strategic',
    title: 'Establish an AI governance framework',
    body: 'Formalise your AI policies, risk management, and review processes. Align with the NAIC AI6 Practices and Australian AI Ethics Principles for responsible use.',
    industries: [],
    painPoints: ['compliance-documentation'],
    maturityLevels: ['implementing', 'leading'],
    dimensions: ['governance-trust', 'strategy-leadership'],
    ai6Practices: [1, 2, 3, 4],
    timeToValue: '1\u20132 months',
    badge: 'Implementation Practices',
  },
  {
    id: 'st-transparency',
    category: 'strategic',
    title: 'Implement customer AI transparency',
    body: 'Set up clear disclosure wherever AI interacts with customers \u2014 chatbots, automated emails, AI-generated content. Build trust through openness.',
    industries: [],
    painPoints: ['customer-response-time', 'lead-followup'],
    maturityLevels: ['implementing', 'leading'],
    dimensions: ['governance-trust'],
    ai6Practices: [4],
    timeToValue: '2\u20134 weeks',
    badge: 'AI Ethics: Transparency',
  },
  {
    id: 'st-team-upskilling',
    category: 'strategic',
    title: 'Invest in structured AI training for your team',
    body: 'Move beyond ad-hoc learning. Run workshops, certify key staff, and embed AI skills into role descriptions and onboarding.',
    industries: [],
    painPoints: ['staff-onboarding'],
    maturityLevels: ['implementing', 'leading'],
    dimensions: ['people-skills'],
    ai6Practices: [6],
    timeToValue: '1\u20133 months',
  },
  {
    id: 'st-automated-pipelines',
    category: 'strategic',
    title: 'Build automated AI pipelines',
    body: 'Create end-to-end automated workflows that run without manual triggers \u2014 new lead intake, invoice processing, compliance reporting.',
    industries: [],
    painPoints: ['admin-overload', 'lead-followup', 'financial-reporting'],
    maturityLevels: ['leading'],
    dimensions: ['implementation-value', 'data-infrastructure'],
    ai6Practices: [5, 6],
    timeToValue: '3\u20136 months',
  },
  {
    id: 'st-custom-ai-models',
    category: 'strategic',
    title: 'Develop custom AI models for your domain',
    body: 'Fine-tune or build AI models trained on your industry data. Move from generic tools to proprietary AI that becomes a competitive advantage.',
    industries: [],
    painPoints: [],
    maturityLevels: ['leading'],
    dimensions: ['data-infrastructure', 'implementation-value', 'strategy-leadership'],
    ai6Practices: [3, 5],
    timeToValue: '3\u20136 months',
  },
  {
    id: 'st-ai-advisory-board',
    category: 'strategic',
    title: 'Establish an AI advisory or review board',
    body: 'Bring in external expertise to guide your AI strategy. Review deployments, assess emerging risks, and ensure alignment with evolving regulation.',
    industries: [],
    painPoints: [],
    maturityLevels: ['leading'],
    dimensions: ['governance-trust', 'strategy-leadership'],
    ai6Practices: [1, 2, 3],
    timeToValue: '1\u20132 months',
    badge: 'Implementation Practices',
  },
  {
    id: 'st-ai-product-innovation',
    category: 'strategic',
    title: 'Launch AI-powered products or services',
    body: 'Package your AI capabilities as customer-facing offerings. AI-enhanced reporting, predictive insights, or automated services that differentiate your business.',
    industries: [],
    painPoints: [],
    maturityLevels: ['leading'],
    dimensions: ['implementation-value', 'strategy-leadership'],
    ai6Practices: [5],
    timeToValue: '3\u20136+ months',
  },
];

// ── Dimension Feedback ────────────────────────────────────────────────────────

const DIMENSION_FEEDBACK: Record<ReadinessDimension, Record<ReadinessLevel, string>> = {
  'strategy-leadership': {
    emerging:
      'Your business doesn\u2019t have a clear AI direction yet. Start by assigning someone to explore where AI could help most.',
    developing:
      'You\u2019ve started thinking about AI, but it\u2019s not formalised. Identify your top 2\u20133 AI opportunities and assign ownership.',
    implementing:
      'You have clear AI leadership and identified opportunities. Focus on aligning AI initiatives with business goals.',
    leading:
      'Strong AI strategy in place. Keep refining your AI roadmap and exploring advanced applications.',
  },
  'people-skills': {
    emerging:
      'Your team hasn\u2019t engaged with AI tools yet. Start with awareness \u2014 show the team what\u2019s possible with a quick demo.',
    developing:
      'Some staff are exploring AI informally. Create basic guidelines so everyone knows what\u2019s OK to use AI for.',
    implementing:
      'Your team has solid AI foundations. Build a shared prompt library and encourage consistent use across workflows.',
    leading:
      'Your team is confident with AI. Consider advanced training and embedding AI skills into role descriptions.',
  },
  'data-infrastructure': {
    emerging:
      'Your data is scattered across systems. Focus on centralising key information before adding AI tools.',
    developing:
      'Your data is mostly digital but fragmented. Prioritise connecting your core systems and improving data quality.',
    implementing:
      'Good data foundations. Ensure your data is secure and structured enough for AI tools to work with effectively.',
    leading:
      'Strong data infrastructure. You\u2019re well positioned for advanced AI integrations and automated pipelines.',
  },
  'governance-trust': {
    emerging:
      'You haven\u2019t considered how to manage AI risks yet. Start with the NAIC AI Screening Tool to identify high-risk use cases.',
    developing:
      'You have some awareness of AI risks but no formal processes. Create a basic review process for AI outputs.',
    implementing:
      'You\u2019re building AI safeguards. Formalise your approach with an AI register and customer transparency measures.',
    leading:
      'Strong governance in place. Align with the full NAIC AI6 framework and consider publishing your AI practices.',
  },
  'implementation-value': {
    emerging:
      'You haven\u2019t tried AI in your business yet. Pick one low-risk workflow (like email drafting) and run a 30-day trial.',
    developing:
      'You\u2019ve experimented with AI informally. Start tracking results so you can decide what to scale.',
    implementing:
      'AI is active in several workflows. Measure ROI consistently and identify the next processes to automate.',
    leading:
      'AI is deeply embedded in your operations. Focus on continuous improvement, pipeline automation, and staying ahead.',
  },
};

// ── Scoring ────────────────────────────────────────────────────────────────────

export function computeDimensionScore(
  dimension: ReadinessDimension,
  answers: Record<string, number>
): number {
  const questions = DIMENSION_QUESTIONS.filter((q) => q.dimension === dimension);
  if (questions.length === 0) return 0;

  const answered = questions.filter((q) => answers[q.id] !== undefined);
  if (answered.length === 0) return 0;

  const maxPossible = answered.length * 4;
  const actual = answered.reduce((sum, q) => sum + (answers[q.id] ?? 0), 0);

  return Math.round((actual / maxPossible) * 100);
}

export function scoreToLevel(score: number): ReadinessLevel {
  if (score <= 25) return 'emerging';
  if (score <= 50) return 'developing';
  if (score <= 75) return 'implementing';
  return 'leading';
}

function getDimensionFeedback(dimension: ReadinessDimension, level: ReadinessLevel): string {
  return DIMENSION_FEEDBACK[dimension][level];
}

const MATURITY_ORDER: MaturityLevel[] = ['emerging', 'developing', 'implementing', 'leading'];

function effectiveMaturity(
  profile: AssessmentProfile,
  overallLevel: ReadinessLevel
): MaturityLevel {
  // If user explicitly selected maturity, use it; otherwise derive from overall score
  return profile.maturityLevel ?? overallLevel;
}

function scoreRecommendation(
  card: RecommendationCard,
  profile: AssessmentProfile,
  dimensionScores: DimensionScore[],
  userMaturity: MaturityLevel
): number {
  let score = 0;

  // Industry match
  if (card.industries.length === 0) {
    score += 1;
  } else if (profile.industry && card.industries.includes(profile.industry)) {
    score += 3;
  } else {
    score -= 1;
  }

  // Pain point match (up to +6)
  const painMatches = card.painPoints.filter((p) => profile.painPoints.includes(p)).length;
  score += Math.min(painMatches * 2, 6);

  // Maturity match — strongest signal. Cards must be appropriate for the user's level.
  const userIdx = MATURITY_ORDER.indexOf(userMaturity);
  if (card.maturityLevels.length === 0) {
    // Universal cards — slight penalty for advanced users (basic stuff less impressive)
    score += userIdx <= 1 ? 2 : 0;
  } else if (card.maturityLevels.includes(userMaturity)) {
    score += 5; // Strong match

    // Forward-looking bonus: card bridges to the next level (growth path).
    // Research shows progression through phases matters — nudge users toward
    // cards that prepare them for the next stage.
    const nextLevel = MATURITY_ORDER[userIdx + 1];
    if (nextLevel && card.maturityLevels.includes(nextLevel)) {
      score += 2;
    }

    // Backward drag: card also targets a level below the user, suggesting it
    // may be basic for their current stage — slight deprioritisation.
    const prevLevel = MATURITY_ORDER[userIdx - 1];
    if (prevLevel && card.maturityLevels.includes(prevLevel)) {
      score -= 1;
    }
  } else {
    // Penalise based on distance — the further the mismatch, the worse
    const cardIndices = card.maturityLevels.map((m) => MATURITY_ORDER.indexOf(m));
    const closestIdx = cardIndices.reduce((closest, idx) =>
      Math.abs(idx - userIdx) < Math.abs(closest - userIdx) ? idx : closest
    );
    const distance = Math.abs(closestIdx - userIdx);
    score -= distance * 3; // -3 per level of mismatch
  }

  // Dimension weakness bonus — cards that address weak dimensions score higher
  const weakDimensions = dimensionScores.filter((ds) => ds.score < 50);
  const dimensionBonus = card.dimensions.filter((d) =>
    weakDimensions.some((wd) => wd.dimension === d)
  ).length;
  score += dimensionBonus * 2;

  return score;
}

export function computeResults(profile: AssessmentProfile): AssessmentResults | null {
  const hasAnyDimensionAnswers = Object.keys(profile.dimensionAnswers).length > 0;

  // Need at least industry, plus either a maturity selection or dimension answers
  if (!profile.industry || (!profile.maturityLevel && !hasAnyDimensionAnswers)) return null;

  // Compute dimension scores. The guard above means maturity is set whenever there are no
  // dimension answers; capturing it lets TypeScript see that inside the callback.
  const maturity = profile.maturityLevel;
  const dimensionScores: DimensionScore[] = DIMENSIONS.map((dim) => {
    const score =
      hasAnyDimensionAnswers || !maturity
        ? computeDimensionScore(dim.id, profile.dimensionAnswers)
        : maturityToBaseScore(maturity);
    const level = scoreToLevel(score);

    return {
      dimension: dim.id,
      label: dim.label,
      score,
      level,
      feedback: getDimensionFeedback(dim.id, level),
      ai6Practices: AI6_PRACTICES.filter((p) => dim.ai6Practices.includes(p.id)),
    };
  });

  // Overall score (weighted average)
  const weights: Record<ReadinessDimension, number> = {
    'strategy-leadership': 1.2,
    'people-skills': 1.0,
    'data-infrastructure': 1.0,
    'governance-trust': 0.9,
    'implementation-value': 1.2,
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const overallScore = Math.round(
    dimensionScores.reduce((sum, ds) => sum + ds.score * weights[ds.dimension], 0) / totalWeight
  );
  const overallLevel = scoreToLevel(overallScore);
  const { naicTrack } = getReadinessLevelMeta(overallLevel);

  // Score recommendation cards
  const userMaturity = effectiveMaturity(profile, overallLevel);
  const scored = RECOMMENDATION_CARDS.map((card) => ({
    ...card,
    score: scoreRecommendation(card, profile, dimensionScores, userMaturity),
  }));

  const byCategory = (cat: RecommendationCategory, limit: number) =>
    scored
      .filter((c) => c.category === cat && c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

  const quickWins = byCategory('quick-win', 4);
  const nextSteps = byCategory('next-step', 4);
  const strategicActions = byCategory('strategic', 3);

  const topOpportunities = [...quickWins, ...nextSteps, ...strategicActions]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Industry benchmarks
  const benchmarks = INDUSTRY_BENCHMARKS.filter((b) => b.industry === profile.industry);

  return {
    overallScore,
    overallLevel,
    dimensionScores,
    naicTrack,
    quickWins,
    nextSteps,
    strategicActions,
    topOpportunities,
    benchmarks,
    frameworkReferences: FRAMEWORK_REFERENCES,
  };
}

/** Convert a maturity level to an approximate base score when no dimension questions are answered */
function maturityToBaseScore(maturity: MaturityLevel): number {
  switch (maturity) {
    case 'emerging':
      return 13;
    case 'developing':
      return 38;
    case 'implementing':
      return 63;
    case 'leading':
      return 88;
  }
}
