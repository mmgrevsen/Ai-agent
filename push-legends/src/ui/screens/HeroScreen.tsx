import { useState } from 'react';
import { store, useGame } from '../../app/store';
import { COSMETICS } from '../../core/content/cosmetics';
import { EQUIP_SLOTS, FLAT_STATS, getItem, STAT_LABELS, type EquipSlot, type StatKey } from '../../core/content/equipment';
import { PETS, getPet } from '../../core/content/pets';
import { checkItemUpgrade, itemMaxLevel, itemStats } from '../../core/systems/equipment';
import { computeHeroStats, powerRating, xpToNextLevel } from '../../core/systems/hero';
import { petPassiveValue, petUpgradeCost } from '../../core/systems/pets';
import { armoryOffers, pushupDamage, pushupDamageWithWeapon } from '../../core/systems/armory';
import { BALANCE } from '../../core/config/balance';
import { formatNumber } from '../../core/util';
import { drawSprite } from '../art/units';
import { ArtCanvas, Bar, ItemArt, ModalShell, PetArt, RarityTag, Segmented } from '../components/common';
import { Icon } from '../components/Icon';

const SLOT_LABEL: Record<EquipSlot, string> = { weapon: 'Weapon', helmet: 'Helmet', chest: 'Armor', gloves: 'Gloves', boots: 'Boots', relic: 'Relic' };

export function fmtStat(key: StatKey, v: number): string {
  return FLAT_STATS.has(key) ? `+${formatNumber(v)}` : `+${Math.round(v * 1000) / 10}%`;
}

export function HeroScreen() {
  const { game } = useGame();
  const [view, setView] = useState<'gear' | 'pets' | 'style'>('gear');
  const stats = computeHeroStats(game);
  const xpNeed = xpToNextLevel(game.hero.level);

  return (
    <div className="stack-m">
      <div className="hero-stage">
        <ArtCanvas
          width={492}
          height={170}
          animate
          className="world-banner-canvas"
          draw={(ctx, t) => {
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath();
            ctx.ellipse(246, 156, 90, 14, 0, 0, Math.PI * 2);
            ctx.fill();
            drawSprite(ctx, { type: 'hero', cape: game.hero.cape, aura: game.hero.aura }, 246, 152, { t, facing: 1, attack: (t % 3) < 0.3 ? (t % 3) / 0.3 : 0, hit: 0, scale: 2.4, moving: false });
          }}
        />
        <div style={{ position: 'absolute', top: 10, left: 14 }}>
          <div className="xsmall faint">{game.profile.title}</div>
          <h1>{game.profile.name}</h1>
          <div className="small dim">Power {formatNumber(powerRating(game))}</div>
        </div>
        {game.activePet && (
          <div style={{ position: 'absolute', bottom: 6, right: 10 }}>
            <PetArt petId={game.activePet} size={64} animate />
          </div>
        )}
      </div>

      <div className="panel">
        <div className="spread">
          <h2>Level {game.hero.level}</h2>
          <span className="small dim">
            {formatNumber(game.hero.xp)} / {formatNumber(xpNeed)} XP
          </span>
        </div>
        <Bar value={game.hero.xp} max={xpNeed} tone="purple" />
        <div className="grid-2" style={{ marginTop: 10 }}>
          <div className="stat-row">
            <span className="row">
              <Icon name="heart" size={16} /> Health
            </span>
            <b>{formatNumber(stats.hp)}</b>
          </div>
          <div className="stat-row">
            <span className="row">
              <Icon name="swords" size={16} /> Damage
            </span>
            <b>{formatNumber(stats.damage)}</b>
          </div>
          <div className="stat-row" style={{ gridColumn: '1 / -1' }}>
            <span className="row gold-text">
              <Icon name="swords" size={16} /> Damage per push-up
            </span>
            <b className="gold-text">{formatNumber(pushupDamage(stats))}</b>
          </div>
          <div className="stat-row">
            <span>Crit chance</span>
            <b>{Math.round(stats.critChance * 100)}%</b>
          </div>
          <div className="stat-row">
            <span>Push-up power</span>
            <b>×{stats.repPower.toFixed(2)}</b>
          </div>
          <div className="stat-row">
            <span>Army damage</span>
            <b>×{stats.armyDamage.toFixed(2)}</b>
          </div>
          <div className="stat-row">
            <span>Army health</span>
            <b>×{stats.armyHp.toFixed(2)}</b>
          </div>
          <div className="stat-row">
            <span>Gold bonus</span>
            <b>×{stats.goldBonus.toFixed(2)}</b>
          </div>
          <div className="stat-row">
            <span>Offline bonus</span>
            <b>×{stats.offlineBonus.toFixed(2)}</b>
          </div>
        </div>
        <p className="xsmall faint" style={{ margin: '8px 0 0' }}>
          <b className="gold-text">Push-up strike:</b> every verified push-up makes your hero strike the nearest enemy for {BALANCE.exercise.repStrikeDamage}× hero damage (knee push-ups {Math.round(BALANCE.exercise.kneeRepMultiplier * 100)}%). Better swords raise hero damage, so every rep hits harder.
          <br />
          <b className="gold-text">Legend Strike:</b> charges on its own during battle, hits nearby enemies for {BALANCE.combat.specialDamageMultiplier}× hero damage, stuns them and interrupts boss attacks.
        </p>
      </div>

      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'gear', label: 'Gear' },
          { value: 'pets', label: 'Pets' },
          { value: 'style', label: 'Style' },
        ]}
      />
      {view === 'gear' && <GearView />}
      {view === 'pets' && <PetsView />}
      {view === 'style' && <StyleView />}
    </div>
  );
}

function GearView() {
  const { game } = useGame();
  const [slotFilter, setSlotFilter] = useState<EquipSlot | 'all'>('all');
  const equippedUids = new Set(Object.values(game.hero.equipped));
  const items = game.items.filter((i) => slotFilter === 'all' || getItem(i.defId).slot === slotFilter);
  return (
    <div className="stack-m">
      <Armory />
      <div className="slot-grid">
        {EQUIP_SLOTS.map((slot) => {
          const item = game.items.find((i) => i.uid === game.hero.equipped[slot]);
          const def = item ? getItem(item.defId) : null;
          return (
            <button key={slot} className={`slot ${def ? `filled rarity-${def.rarity}` : ''}`} onClick={() => (item ? store.openModal({ kind: 'item', uid: item.uid }) : setSlotFilter(slot))} aria-label={`${SLOT_LABEL[slot]}: ${def?.name ?? 'empty'}`}>
              <span className="xsmall faint">{SLOT_LABEL[slot]}</span>
              {def && item ? (
                <>
                  <ItemArt defId={def.id} size={40} />
                  <span className="slot-name">{def.name}</span>
                  <span className="xsmall">Lv {item.level}</span>
                </>
              ) : (
                <span className="faint" style={{ marginTop: 14 }}>
                  <Icon name="plus" size={20} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="section-title">
        <h3>Inventory</h3>
        <select className="field" style={{ width: 'auto', minHeight: 34 }} value={slotFilter} onChange={(e) => setSlotFilter(e.target.value as EquipSlot | 'all')} aria-label="Filter by slot">
          <option value="all">All slots</option>
          {EQUIP_SLOTS.map((s) => (
            <option key={s} value={s}>
              {SLOT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="col">
        {items.length === 0 && <div className="empty">No gear for this slot yet. Bosses, chests and first clears drop gear.</div>}
        {items.map((item) => {
          const def = getItem(item.defId);
          const up = checkItemUpgrade(game, item.uid);
          return (
            <button key={item.uid} className={`item-row rarity-${def.rarity}`} onClick={() => store.openModal({ kind: 'item', uid: item.uid })}>
              <div className="item-icon">
                <ItemArt defId={def.id} size={40} />
              </div>
              <div className="grow">
                <div className="row">
                  <span className="display">{def.name}</span>
                  {equippedUids.has(item.uid) && <span className="chip green">Equipped</span>}
                </div>
                <div className="xsmall dim">
                  Lv {item.level} · {SLOT_LABEL[def.slot]} <span className="stars">{'★'.repeat(item.stars)}</span>
                </div>
                <div className="xsmall">
                  {Object.entries(itemStats(item))
                    .map(([k, v]) => `${STAT_LABELS[k as StatKey]} ${fmtStat(k as StatKey, v)}`)
                    .join(' · ')}
                </div>
              </div>
              {up.ok && <span className="upgrade-arrow" style={{ position: 'static' }}>↑</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Armory() {
  const { game } = useGame();
  const offers = armoryOffers(game);
  const current = pushupDamage(computeHeroStats(game));
  return (
    <div className="panel gold">
      <div className="section-title">
        <h2>Armory</h2>
        <span className="chip gold">
          <Icon name="swords" size={12} /> {formatNumber(current)} per push-up
        </span>
      </div>
      <p className="xsmall dim" style={{ margin: '0 0 10px' }}>
        Spend gold on better swords. A stronger sword raises your hero's damage, so every push-up hits harder. Old swords are kept.
      </p>
      <div className="col">
        {offers.map((o) => {
          const def = getItem(o.defId);
          return (
            <div key={o.defId} className={`item-row rarity-${def.rarity}`} style={{ cursor: 'default', opacity: o.unlocked ? 1 : 0.55 }}>
              <div className="item-icon">
                <ItemArt defId={def.id} size={40} />
              </div>
              <div className="grow">
                <div className="display">{def.name}</div>
                <div className="xsmall dim">
                  +{def.stats.heroDamage} hero damage{def.effectText ? ` · ${def.effectText}` : ''}
                </div>
                <div className="xsmall gold-text">
                  {formatNumber(o.pushupDamageWith)} per push-up {o.pushupDamageWith > current && !o.owned ? `(+${formatNumber(o.pushupDamageWith - current)})` : ''}
                </div>
              </div>
              {o.owned ? (
                <span className="chip green">Owned</span>
              ) : !o.unlocked ? (
                <span className="chip">
                  <Icon name="lock" size={12} /> Stage {Math.floor(o.unlockStage / 10) + 1}-{(o.unlockStage % 10) + 1}
                </span>
              ) : (
                <button className="btn gold small" disabled={!o.affordable} onClick={() => store.buySword(o.defId)}>
                  <Icon name="gold" size={14} /> {formatNumber(o.price)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PetsView() {
  const { game } = useGame();
  return (
    <div className="col">
      <p className="small dim" style={{ margin: 0 }}>
        One pet joins you in battle. Pets give passive bonuses (and some have active abilities). You keep every pet forever; duplicates add stars.
      </p>
      {PETS.map((def) => {
        const p = game.pets[def.id];
        const cost = p ? petUpgradeCost(p.level) : null;
        const active = game.activePet === def.id;
        return (
          <div key={def.id} className={`list-item rarity-${def.rarity}`} style={{ alignItems: 'flex-start', opacity: p ? 1 : 0.6 }}>
            <PetArt petId={def.id} size={64} animate={active} />
            <div className="grow col" style={{ gap: 3 }}>
              <div className="row">
                <span className="display">{def.name}</span>
                <RarityTag rarity={def.rarity} />
              </div>
              <div className="xsmall dim">{def.description}</div>
              <div className="small">
                {STAT_LABELS[def.passiveStat]} <b className="good-text">{fmtStat(def.passiveStat, p ? petPassiveValue(game, def.id) : def.passiveBase)}</b>
              </div>
              {def.activeText && <div className="xsmall gold-text">{def.activeText}</div>}
              {p ? (
                <>
                  <div className="xsmall">
                    Lv {p.level}/{BALANCE.pets.maxLevel} <span className="stars">{'★'.repeat(p.stars)}</span>
                  </div>
                  <div className="row">
                    <button className={`btn small ${active ? 'ghost' : 'green'}`} onClick={() => store.setPet(active ? null : def.id)}>
                      {active ? 'Resting' : 'Take along'}
                    </button>
                    {cost && p.level < BALANCE.pets.maxLevel && (
                      <button className="btn small gold" disabled={game.resources.gold < cost.gold || game.resources.petTreats < cost.treats} onClick={() => store.upgradePet(def.id)}>
                        <Icon name="gold" size={14} />
                        {formatNumber(cost.gold)} <Icon name="treat" size={14} />
                        {cost.treats}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <span className="chip">
                  <Icon name="lock" size={12} /> {def.source}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StyleView() {
  const { game } = useGame();
  return (
    <div className="stack-m">
      {(['cape', 'aura'] as const).map((kind) => (
        <div key={kind} className="panel">
          <h3 style={{ marginBottom: 10 }}>{kind === 'cape' ? 'Capes' : 'Auras'}</h3>
          <div className="row wrap">
            {COSMETICS.filter((c) => c.kind === kind).map((c) => {
              const owned = game.hero.cosmetics.includes(c.id);
              const on = game.hero[kind] === c.id;
              return (
                <div key={c.id} className="col" style={{ alignItems: 'center', gap: 2, width: 70 }}>
                  <button
                    className={`cosmetic-swatch ${on ? 'on' : ''} ${owned ? '' : 'locked'}`}
                    style={{ background: c.color === 'transparent' ? 'repeating-linear-gradient(45deg,#333 0 6px,#222 6px 12px)' : `linear-gradient(135deg, ${c.color}, ${c.secondary})` }}
                    onClick={() => owned && store.setCosmetic(kind, c.id)}
                    disabled={!owned}
                    aria-label={`${c.name}${owned ? '' : ' (locked)'}`}
                  />
                  <span className="xsmall center">{c.name}</span>
                  {!owned && <span className="xsmall faint center">{c.source}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ItemModal({ uid }: { uid: string }) {
  const { game } = useGame();
  const item = game.items.find((i) => i.uid === uid);
  if (!item) return null;
  const def = getItem(item.defId);
  const stats = itemStats(item);
  const next = itemStats({ ...item, level: item.level + 1 });
  const check = checkItemUpgrade(game, uid);
  const equipped = game.hero.equipped[def.slot] === uid;
  const maxLv = itemMaxLevel(game);
  return (
    <ModalShell label={def.name} onClose={() => store.closeModal()}>
      <div className="stack-m">
        <div className="row">
          <div className={`item-icon rarity-${def.rarity}`} style={{ width: 80, height: 80 }}>
            <ItemArt defId={def.id} size={70} />
          </div>
          <div className="grow">
            <RarityTag rarity={def.rarity} />
            <h2>{def.name}</h2>
            <div className="small dim">
              {def.kind} · {SLOT_LABEL[def.slot]} · Lv {item.level}/{maxLv} <span className="stars">{'★'.repeat(item.stars)}</span>
            </div>
          </div>
        </div>
        <p className="small dim" style={{ margin: 0 }}>
          {def.description}
        </p>
        <table className="compare-table">
          <tbody>
            {Object.entries(stats).map(([k, v]) => (
              <tr key={k}>
                <td>{STAT_LABELS[k as StatKey]}</td>
                <td>{fmtStat(k as StatKey, v)}</td>
                <td className="up">{check.ok || check.reason === 'gold' || check.reason === 'ore' ? `${fmtStat(k as StatKey, next[k as StatKey] ?? v)} ▲` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {def.slot === 'weapon' && (
          <div className="stat-row">
            <span className="gold-text">Damage per push-up with this weapon</span>
            <b className="gold-text">{formatNumber(pushupDamageWithWeapon(game, item.defId, item.level, item.stars))}</b>
          </div>
        )}
        {def.effectText && <div className="panel dark small gold-text">{def.effectText}</div>}
        <div className="xsmall faint">Duplicates of this item add a star (+{Math.round(BALANCE.equipment.starBonus * 100)}% stats each). Items are never destroyed.</div>
        <div className="row">
          <button className={`btn grow ${equipped ? 'ghost' : 'green'}`} onClick={() => (equipped ? store.unequip(def.slot) : store.equip(uid))}>
            {equipped ? 'Unequip' : 'Equip'}
          </button>
          {check.ok || check.reason !== 'max_level' ? (
            <button className="btn gold grow" disabled={!check.ok} onClick={() => store.upgradeItem(uid)}>
              <Icon name="gold" size={16} /> {formatNumber(check.gold)} <Icon name="ore" size={16} /> {check.ore}
            </button>
          ) : (
            <span className="chip grow center">Upgrade the Blacksmith to raise the level cap</span>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

export { getPet };
