# Design System: Daily Task Tracker Desktop

## 1. Visual Theme & Atmosphere
The interface should feel operational, calm, and precise: a clean productivity workspace with light spatial breathing, restrained accents, and clear hierarchy. Density stays in "daily app" mode: information-rich but never cramped.

## 2. Color Palette & Roles
- **Canvas Mist** (`#F5F7FB`) - Global background
- **Pure Surface** (`#FFFFFF`) - Primary cards and panels
- **Ink Slate** (`#17202B`) - Primary text and headings
- **Muted Steel** (`#64748B`) - Secondary text and helper content
- **Divider Cloud** (`#D8E0EB`) - Borders, table lines, separators
- **Action Teal** (`#0F766E`) - Single accent for key CTA and active states
- **Success Green** (`#1F9D57`) - Positive status and confirmation
- **Warning Rose** (`#C2415E`) - Error/destructive states

## 3. Typography Rules
- **Display/UI headings:** `"Microsoft YaHei", "Segoe UI", sans-serif`
- **Body:** same family, normal weight for readability in Chinese-heavy interface
- **Monospace usage:** only for technical snippets, IDs, or metrics where needed
- **Line length:** narrative copy should stay around 65ch where practical
- **Hierarchy:** rely on size + weight + spacing, not decorative effects

## 4. Component Stylings
- **Buttons:** rounded (`10px`), tactile press feedback (`translateY + scale`), no neon glow
- **Inputs:** visible border + clear focus ring; labels above fields, error text below
- **Cards:** rounded (`14-16px`), soft diffusion shadow, used to group real context
- **Tables:** quiet header tint, clear row contrast, maintain scanability for long task lists
- **Status blocks:** use subtle tinted backgrounds rather than thick side accent stripes

## 5. Layout Principles
- Left nav + top context bar + tabbed workspace as the primary shell
- Content area should scroll inside panels, not push the full window
- Keep container rhythm consistent: 12/14/18/24 spacing cadence
- On smaller viewports, reduce outer padding and preserve one-column readability

## 6. Motion & Interaction
- Micro-motion only, 150-250ms for hover/focus/active transitions
- Animate transform/opacity; avoid layout-jumping animations
- Active and focus states must be obvious for both mouse and keyboard users
- Keep motion optional and non-blocking

## 7. Anti-Patterns (Banned)
- No emoji icons for system/structural actions
- No pure black (`#000000`) and no pure white-only contrast extremes
- No AI-style purple/blue neon glow gradients
- No gradient text headers
- No thick left color bars as a generic emphasis shortcut
- No random mixed palettes across modules
