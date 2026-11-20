# A-06 Interface

## Primary screens (max 5)
1. System Inventory (list + filters)
2. System Detail (categorization, baseline, controls summary)
3. Control Implementation (per-control status + evidence)
4. Assessments & POA&M
5. Authorization & Monitoring Dashboard

## Information hierarchy
- System list → system detail → control implementation; POA&M and authorization as tabs within system detail.

## Primary job-to-result flow
- Register system → categorize → select baseline → implement controls + evidence → assess → POA&M → authorize → monitor.

## States
- Loading skeletons; empty states with CTA; error with retry; disabled when unauthorized; offline banner with cached read; success toasts; permission-denied view.

## Responsive
- Desktop-first; tablet usable; mobile read-only summary.

## Accessibility
- WCAG 2.1 AA; full keyboard navigation; screen reader labels; focus management on modals; color contrast >=4.5:1.

## NFR and controls
- NFR: as A-02; p95 page load <= 2s.
- Controls: no PII in client logs; CSP headers; XSS sanitization.
