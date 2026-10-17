import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/core/content/cards';
import { RARITY_FRAME, UNIT_LOOK } from '../src/ui/art/darkArt';
import { ALL_BOSSES, WORLDS } from '../src/core/content/worlds';
import { bossUnit, buildHero, CARD_UNITS, enemyUnit } from '../src/ui/battle3d/dark/units';

describe('dark card art rules', () => {
  it('card frame colours in app.css match RARITY_FRAME', () => {
    const css = readFileSync(join(__dirname, '../src/ui/styles/app.css'), 'utf8');
    for (const [rarity, frame] of Object.entries(RARITY_FRAME)) {
      const block = css.match(new RegExp(`\\.rarity-${rarity} \\{([^}]*)\\}`))?.[1] ?? '';
      expect(block, rarity).toContain(`--fr-metal: ${frame.metal};`);
      expect(block, rarity).toContain(`--fr-edge: ${frame.edge};`);
      expect(block, rarity).toContain(`--fr-accent: ${frame.accent};`);
      expect(block, rarity).toContain(`--fr-glow: ${frame.glow.replaceAll(',', ', ')};`);
    }
  });

  it('every card has a faction look and a 3D unit, and nothing else does', () => {
    const ids = CARDS.map((c) => c.id).sort();
    expect(Object.keys(UNIT_LOOK).sort()).toEqual(ids);
    expect(Object.keys(CARD_UNITS).sort()).toEqual(ids);
  });

  it('every card unit builds a complete rig', () => {
    for (const card of CARDS) {
      const rig = CARD_UNITS[card.id]!.build();
      expect(rig.height, card.id).toBeGreaterThan(0.5);
      expect(rig.body.children.length, card.id).toBeGreaterThan(0);
      if (rig.kind === 'biped') expect(rig.legs.length + (rig.armR ? 1 : 0), card.id).toBeGreaterThan(0);
      if (card.flying) expect(['flyer', 'float'], card.id).toContain(rig.kind);
    }
  });

  it('the hero, every enemy role in every world and every boss build a dark model', () => {
    expect(buildHero('#5e0f14', 'sword').height).toBeGreaterThan(1);
    expect(buildHero('#3498db', 'goldsword').height).toBeGreaterThan(1);
    for (const w of WORLDS) {
      for (const role of ['normal', 'ranged', 'fast', 'armored', 'flying']) {
        const rig = enemyUnit(role, w.index, w.enemyPalette);
        expect(rig.height, `${w.index}:${role}`).toBeGreaterThan(0.5);
        if (role === 'flying') expect(['flyer', 'float'], `${w.index}:${role}`).toContain(rig.kind);
      }
    }
    for (const b of ALL_BOSSES) {
      const rig = bossUnit(b.sprite, b.palette);
      expect(rig, b.id).not.toBeNull();
      expect(rig!.height, b.id).toBeGreaterThan(1);
    }
  });
});
