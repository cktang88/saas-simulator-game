// Demo-video script rubric (docs/research/judging/sales.md §8; Wistia length data; hook criterion is a [design] assumption).
export const DEMO_RUBRIC = [
  { key: 'hook', label: 'Hook in the first 10 seconds', weight: 2,
    anchors: { 1: 'starts with a logo, "Hi, I\'m..." or the company story', 3: 'names the product category', 5: 'first sentence names the viewer and a pain in their own words' } },
  { key: 'problem_first', label: 'Problem before product', weight: 1.5,
    anchors: { 1: 'opens with features', 3: 'mentions the problem in passing', 5: 'a concrete pain moment comes before any product' } },
  { key: 'shows_product', label: 'Shows the real product doing one task', weight: 3,
    anchors: { 1: 'claims only, nothing shown', 3: 'one or two screens described', 5: 'three or more concrete clicks in the shipped product that complete one task' } },
  { key: 'outcome', label: 'Ends on a specific result', weight: 1.5,
    anchors: { 1: 'no result', 3: 'a vague benefit ("save time")', 5: 'a number or before/after the viewer gets (minutes saved, errors avoided)' } },
  { key: 'cta', label: 'One clear next step', weight: 1,
    anchors: { 1: 'no next step or several', 3: 'a generic "learn more"', 5: 'one specific next step matched to the viewer (start free trial, book a 15-minute setup)' } },
  { key: 'plain_language', label: 'Plain words, no filler', weight: 1,
    anchors: { 1: 'buzzwords and repeated phrases (seamless, AI-powered, all-in-one)', 3: 'some jargon', 5: 'the words the viewer uses; every sentence adds information' } },
];
