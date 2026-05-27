# Luxury Style Names Planning Document

> **Summary**: Replace generic design-movement style labels with premium lifestyle-context names that resonate with UHNW buyers of $10M+ properties.
>
> **Project**: Virtual Staging SaaS
> **Version**: 1.0
> **Author**: rennesbory
> **Date**: 2026-05-27
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

The current six style labels (Modern, Minimalist, Scandinavian, Industrial, Mid-Century Modern, Bohemian) read as IKEA catalog categories. They signal "design student" rather than "AD100 interior designer." For a $149+/listing product targeting realtors selling $10M+ properties, every buyer-facing word must reinforce luxury positioning.

This plan defines six replacement style names grounded in luxury lifestyle contexts — the same language used by RH, Kelly Wearstler, Apparatus Studio, and the AD100.

### 1.2 Background

The app currently defines styles as a TypeScript `const` array in `app/page.tsx` and maps each style to room-specific AI prompts in `app/api/generate/route.ts`. The names appear directly in the UI as button labels. Competing services (Barion Design, roOomy) also use generic design-movement names — this is an immediate differentiator.

Target buyers — hedge fund managers, celebrities, tech founders, international UHNW individuals buying in Bel Air, Manhattan, Hamptons, Miami Beach, Aspen — respond to aspiration and lifestyle identity, not design taxonomy.

### 1.3 Related Documents

- Implementation file: `app/page.tsx` (STYLES array, line 15–22)
- Implementation file: `app/api/generate/route.ts` (PROMPTS record, line 37+)

---

## 2. Proposed Style Names — Research & Rationale

### 2.1 Analysis Summary Table

| # | New Name | Tagline | Replaces | Lifestyle Evoked |
|---|----------|---------|----------|-----------------|
| 1 | **Estate Modern** | Architectural restraint, curator's eye | Modern | The primary residence of someone whose architect was on the AD100 |
| 2 | **Collector's Reserve** | Patina, provenance, quiet authority | Mid-Century Modern | A Tribeca loft where every object has a story and a Christie's receipt |
| 3 | **Riviera Residence** | Sun-bleached stone, open sky, effortless warmth | Scandinavian | A Cap d'Antibes villa between editorial shoots |
| 4 | **Atelier Noir** | Dramatic materiality, deliberate shadow | Industrial | A West Chelsea townhouse owned by a gallerist or fashion director |
| 5 | **Sanctuary** | Nothing superfluous, nothing missing | Minimalist | A Malibu compound where silence is the primary material |
| 6 | **Grand Tour** | Layered provenance, every continent represented | Bohemian | A Hamptons estate where every rug was acquired in person, in Marrakech |

---

## 3. Detailed Style Profiles

### Style 1: Estate Modern
**Tagline**: Architectural restraint, curator's eye

**Furniture & Material Palette**:
- Honed Calacatta marble slab surfaces
- Bespoke modular sectional in heavyweight linen (RH, B&B Italia register)
- Brushed unlacquered brass hardware and lighting
- White oak with wire-brushed finish
- Oversized hand-knotted wool rug in warm neutral
- Single large-scale sculptural ceramic or bronze object

**Lifestyle context**: The primary residence of someone whose architect was shortlisted for the Pritzker. Restraint reads as confidence, not economy. Every surface is a material decision.

**Replaces**: Modern

---

### Style 2: Collector's Reserve
**Tagline**: Patina, provenance, quiet authority

**Furniture & Material Palette**:
- Walnut or rosewood case goods with age-appropriate patina
- Cognac or tobacco full-grain leather seating (Poltrona Frau register)
- Articulated brass task and ambient lighting
- Vintage Persian or Oushak rug, room-scale
- Art books stacked with intention (Phaidon, Rizzoli spines visible)
- Single midcentury signed piece (Nakashima, Judd, Noguchi register)

**Lifestyle context**: A Tribeca loft where the owner knows the provenance of every object and the phone number of the Christie's specialist who sourced it.

**Replaces**: Mid-Century Modern

---

### Style 3: Riviera Residence
**Tagline**: Sun-bleached stone, open sky, effortless warmth

**Furniture & Material Palette**:
- Aged limestone or plaster-effect walls and surfaces
- Linen and canvas upholstery in warm sand, écru, sea-salt white
- Weathered teak or reclaimed European oak
- Hand-thrown pottery in earth and mineral glazes
- Sheer linen drapes moving in implied coastal breeze
- Lavender, olive, or rosemary in terracotta — living and breathing

**Lifestyle context**: The secondary residence on the French or Italian Riviera. Time moves differently here. The aesthetic is the result of generations of habitation, not a design brief.

**Replaces**: Scandinavian

---

### Style 4: Atelier Noir
**Tagline**: Dramatic materiality, deliberate shadow

**Furniture & Material Palette**:
- Patinated steel and bronze structural elements
- Sumptuous velvet seating in deep forest, ink, or slate
- Raw and polished concrete in conversation
- Blackened oak or fumed hardwood flooring
- Apparatus Studio or Tom Dixon register lighting — sculptural, theatrical
- Large-scale contemporary art or photography (Gagosian register)

**Lifestyle context**: A West Chelsea townhouse owned by a gallerist who splits time between Art Basel and Art Week LA. The darkness is a curation choice.

**Replaces**: Industrial

---

### Style 5: Sanctuary
**Tagline**: Nothing superfluous, nothing missing

**Furniture & Material Palette**:
- Floating platform bed or sofa — architecturally grounded
- Single material story carried throughout (one stone, one wood, one textile)
- Japanese-influenced joinery details, hidden hardware
- Matte, unglazed ceramics — wabi-sabi without the word
- Natural light treated as a primary design element
- Moss, stone, or a single botanical — life, but edited

**Lifestyle context**: A Malibu compound or Tokyo-adjacent pied-à-terre where the owner has studied enough Zen Buddhism to know that silence is the most expensive material of all.

**Replaces**: Minimalist

---

### Style 6: Grand Tour
**Tagline**: Layered provenance, every continent represented

**Furniture & Material Palette**:
- Room-scale antique or vintage rug as the foundation layer (Moroccan, Turkish, Persian)
- Rattan, cane, and lacquered bamboo alongside European antiques
- Hand-embroidered or resist-dyed textiles — ikkat, batik, suzani registers
- Hammered brass, hand-cast bronze, and repoussé metalwork
- Curated global ceramics — not a collection, a cabinet of curiosities
- Living botanicals — large, architectural, tropically scaled

**Lifestyle context**: A Hamptons estate whose owner has spent thirty years buying objects the way they buy wine — in person, in country, with a story attached to every piece.

**Replaces**: Bohemian

---

## 4. Scope

### 4.1 In Scope

- [ ] Update `STYLES` const array in `app/page.tsx` (6 string values)
- [ ] Update `PROMPTS` record keys in `app/api/generate/route.ts` (all room types × 6 styles)
- [ ] Update default style fallback references in `app/api/generate/route.ts`
- [ ] Update `style` TypeScript type derived from the `STYLES` array
- [ ] Refine AI prompts for each new style name to match the upgraded palette descriptions above
- [ ] Update download filename logic in `app/page.tsx` (currently uses `style.toLowerCase()`)

### 4.2 Out of Scope

- UI redesign or visual restyling of the selector buttons
- New room types
- LoRA training for individual style names
- Marketing copy or landing page updates (separate plan)
- Localization / internationalization

---

## 5. Requirements

### 5.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Six new style names replace the six existing ones exactly (1:1 swap, no additions) | Must | Pending |
| FR-02 | All PROMPTS record keys updated to match new names across all 6 room types | Must | Pending |
| FR-03 | Prompt descriptions updated to reflect the elevated material palette for each new style | Must | Pending |
| FR-04 | TypeScript type inference remains valid (no type errors after rename) | Must | Pending |
| FR-05 | Default fallback style updated from "Modern" to "Estate Modern" | Must | Pending |
| FR-06 | Download filename slugification handles multi-word names correctly | Should | Pending |
| FR-07 | Style selector UI labels render the full new names without truncation on mobile | Should | Pending |

### 5.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Brand | Style names must not appear in any competing service's current style list | Manual audit of Barion Design, roOomy |
| Clarity | A luxury realtor unfamiliar with design must immediately understand the aesthetic from the name alone | User test with 3 realtors |
| AI fidelity | Updated prompts must produce visually consistent output with name expectations | Visual QA across all 6 styles × 6 room types |

---

## 6. Success Criteria

### 6.1 Definition of Done

- [ ] All 6 style names updated in `app/page.tsx` and `app/api/generate/route.ts`
- [ ] All 36 prompt strings (6 styles × 6 room types) reviewed and upgraded
- [ ] TypeScript compiles with zero errors
- [ ] Visual QA pass: generated images match the lifestyle context described for each style
- [ ] No regression in existing pipeline (inpainting, LoRA slot, ControlNet depth)

### 6.2 Quality Criteria

- [ ] Zero lint errors
- [ ] Build succeeds (`next build`)
- [ ] No competitor currently uses any of the 6 new names

---

## 7. MoSCoW Prioritization

| Priority | Item |
|----------|------|
| Must | FR-01 through FR-05: core rename across all files |
| Should | FR-06 (filename slugification), FR-07 (mobile truncation check) |
| Could | Add short descriptor text beneath each style name in the UI |
| Won't | New styles, new rooms, or LoRA per-style training in this iteration |

---

## 8. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| AI prompts produce inconsistent output with new style framing | High | Medium | Run visual QA on all 36 combinations before shipping; roll back individual prompts if needed |
| Style names are too abstract — realtors don't know what to select | Medium | Low | Add 6-word descriptor beneath each button (Could tier) |
| "Grand Tour" or "Riviera Residence" already trademarked in adjacent category | Medium | Low | Trademark search before launch; alternatives ready |
| Multi-word style names break existing TypeScript type inference | Low | Low | Verify `as const` array and `(typeof STYLES)[number]` type pattern after rename |

---

## 9. Architecture Considerations

### 9.1 Project Level

Dynamic — feature-based, Next.js fullstack app with BaaS/API integration.

### 9.2 Key Files

| File | Change Type | Detail |
|------|-------------|--------|
| `app/page.tsx` | String update | `STYLES` array lines 15–22; `style` default state line 37; download filename line 118 |
| `app/api/generate/route.ts` | String update | `PROMPTS` object all keys (lines 37–141); fallback reference line 270 |

No new dependencies, no schema changes, no environment variables required.

---

## 10. Next Steps

1. [ ] CTO review and approval of this plan
2. [ ] Write design document (`luxury-style-names.design.md`) — prompt rewrites per style/room
3. [ ] Implement rename + prompt upgrades
4. [ ] Visual QA across all 36 style × room combinations
5. [ ] Ship

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-27 | Initial draft | rennesbory |
