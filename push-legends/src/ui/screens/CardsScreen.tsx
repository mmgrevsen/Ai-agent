import { useState } from 'react';
import { store, useGame } from '../../app/store';
import { BALANCE } from '../../core/config/balance';
import { CARDS, getCard } from '../../core/content/cards';
import { RARITIES, type CardDef, type UnitRole } from '../../core/content/types';
import { averageDeckCost, cardStats, checkCardUpgrade, discoverableCards, fragmentsForUpgrade } from '../../core/systems/cards';
import { chestOdds, chestPrice, CHEST_NAMES } from '../../core/systems/chests';
import { dailyOffers, gloryPrice } from '../../core/systems/shop';
import { decodeDeck, encodeDeck } from '../../core/social/codes';
import type { ChestKind } from '../../core/content/quests';
import { dayKey, formatNumber } from '../../core/util';
import { Bar, CardArt, CardTile, ModalShell, RARITY_NAME, RarityTag, Segmented, useNow } from '../components/common';
import { Icon } from '../components/Icon';

type Sort = 'rarity' | 'level' | 'cost' | 'name';
const ROLE_LABEL: Record<UnitRole, string> = { tank: 'Tank', melee: 'Melee', ranged: 'Ranged', area: 'Area', support: 'Support', assassin: 'Assassin' };

export function CardsScreen() {
  const { game } = useGame();
  const [view, setView] = useState<'deck' | 'shop'>('deck');
  const [sort, setSort] = useState<Sort>('rarity');
  const [role, setRole] = useState<UnitRole | 'all'>('all');
  const [shareOpen, setShareOpen] = useState(false);

  const owned = CARDS.filter((c) => game.cards[c.id]);
  const lockedCards = CARDS.filter((c) => !game.cards[c.id]);
  const sorter = (a: CardDef, b: CardDef) => {
    if (sort === 'level') return (game.cards[b.id]?.level ?? 0) - (game.cards[a.id]?.level ?? 0);
    if (sort === 'cost') return a.cost - b.cost;
    if (sort === 'name') return a.name.localeCompare(b.name);
    return RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity);
  };
  const collection = owned.filter((c) => !game.deck.includes(c.id) && (role === 'all' || c.role === role)).sort(sorter);

  const tile = (id: string) => {
    const p = game.cards[id]!;
    const def = getCard(id);
    return (
      <CardTile
        key={id}
        cardId={id}
        level={p.level}
        fragments={p.fragments}
        need={fragmentsForUpgrade(def.rarity, p.level)}
        inDeck={game.deck.includes(id)}
        canUpgrade={checkCardUpgrade(game, id).ok}
        onClick={() => store.openModal({ kind: 'card', id })}
        width={80}
      />
    );
  };

  return (
    <div className="stack-m">
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'deck', label: 'Deck & Collection' },
          { value: 'shop', label: 'Shop' },
        ]}
      />
      {view === 'shop' ? (
        <ShopView />
      ) : (
        <>
          <div className="panel">
            <div className="section-title">
              <h2>Battle Deck</h2>
              <span className="chip">
                {game.deck.length}/{BALANCE.cards.deckSize} · avg cost {averageDeckCost(game.deck).toFixed(1)}
              </span>
            </div>
            <div className="deck-grid">{game.deck.map(tile)}</div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn small purple grow" onClick={() => store.autoDeck()}>
                <Icon name="auto" size={16} /> Auto-build
              </button>
              <button className="btn small ghost grow" onClick={() => setShareOpen(true)}>
                <Icon name="copy" size={16} /> Share / import
              </button>
            </div>
            <DeckHints deck={game.deck.map(getCard)} />
          </div>

          <div className="section-title">
            <h2>Collection</h2>
            <span className="chip">
              {owned.length}/{CARDS.length} found
            </span>
          </div>
          <div className="row wrap">
            <select className="field" style={{ width: 'auto', minHeight: 36 }} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort cards">
              <option value="rarity">Sort: Rarity</option>
              <option value="level">Sort: Level</option>
              <option value="cost">Sort: Cost</option>
              <option value="name">Sort: Name</option>
            </select>
            <select className="field" style={{ width: 'auto', minHeight: 36 }} value={role} onChange={(e) => setRole(e.target.value as UnitRole | 'all')} aria-label="Filter by role">
              <option value="all">All roles</option>
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {collection.length === 0 && <div className="empty">Every card you own is in your deck. Find more by clearing stages and opening chests.</div>}
          <div className="collection-grid">{collection.map((c) => tile(c.id))}</div>
          {lockedCards.length > 0 && (
            <>
              <div className="section-title">
                <h3 className="faint">Not yet found</h3>
              </div>
              <div className="collection-grid">
                {lockedCards.map((c) => (
                  <CardTile key={c.id} cardId={c.id} locked onClick={() => store.openModal({ kind: 'card', id: c.id })} width={80} />
                ))}
              </div>
            </>
          )}
        </>
      )}
      {shareOpen && <DeckShareModal onClose={() => setShareOpen(false)} />}
    </div>
  );
}

function DeckHints({ deck }: { deck: CardDef[] }) {
  const hints: string[] = [];
  if (!deck.some((d) => d.role === 'tank')) hints.push('No tank: enemies will reach your damage dealers quickly.');
  if (!deck.some((d) => d.targetsAir && d.role !== 'support')) hints.push('No anti-air: flying enemies will dive your back line.');
  if (!deck.some((d) => ['splashBurn', 'frostNova', 'chain', 'armorBreak', 'auroraBreath'].includes(d.ability.kind))) hints.push('No area damage: big waves may overwhelm you.');
  if (hints.length === 0) return <p className="xsmall good-text" style={{ margin: '10px 0 0' }}>Balanced deck: frontline, anti-air and area damage covered.</p>;
  return (
    <div className="col" style={{ marginTop: 10, gap: 4 }}>
      {hints.map((h) => (
        <span key={h} className="xsmall warn-text">
          • {h}
        </span>
      ))}
    </div>
  );
}

function DeckShareModal({ onClose }: { onClose: () => void }) {
  const { game } = useGame();
  const code = encodeDeck(game.deck);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <ModalShell label="Share deck" onClose={onClose}>
      <div className="stack-m">
        <h2>Share your deck</h2>
        <p className="small dim">Send this code to a friend. Deck codes work offline and contain only card choices.</p>
        <div className="row">
          <input className="field grow" readOnly value={code} aria-label="Your deck code" onFocus={(e) => e.target.select()} />
          <button className="btn small" onClick={() => void navigator.clipboard?.writeText(code).then(() => setMsg('Copied!'))}>
            Copy
          </button>
        </div>
        <div className="divider" />
        <h3>Import a deck</h3>
        <input className="field" placeholder="PLD1-..." value={input} onChange={(e) => setInput(e.target.value)} aria-label="Deck code to import" />
        <button
          className="btn green block"
          onClick={() => {
            const ids = decodeDeck(input);
            if (!ids) return setMsg('That code is not valid.');
            const missing = ids.filter((id) => !game.cards[id]).map((id) => getCard(id).name);
            if (!store.importDeck(ids)) return setMsg("You don't own any of those cards yet.");
            setMsg(missing.length ? `Imported. Not owned yet: ${missing.join(', ')}` : 'Deck imported!');
          }}
        >
          Import
        </button>
        {msg && <div className="notice info">{msg}</div>}
      </div>
    </ModalShell>
  );
}

function ShopView() {
  const { game } = useGame();
  const now = useNow(30_000);
  const offers = dailyOffers(game, now);
  const purchased = game.shop.day === dayKey(now) ? game.shop.purchased : [];
  const [gloryCard, setGloryCard] = useState<string>(discoverableCards(game)[0]?.id ?? 'thornbow_archer');
  return (
    <div className="stack-m">
      <div className="notice info small">Everything here is bought with in-game currency earned by playing. There are no real-money purchases.</div>
      <div className="panel">
        <div className="section-title">
          <h2>Daily offers</h2>
          <span className="chip">Refresh daily</span>
        </div>
        <div className="grid-2">
          {offers.map((o) => {
            const def = getCard(o.cardId);
            const bought = purchased.includes(o.id);
            return (
              <div key={o.id} className="list-item col" style={{ alignItems: 'stretch' }}>
                <div className="row">
                  <div className={`card-detail-art mini rarity-${def.rarity}`}>
                    <CardArt cardId={o.cardId} width={44} />
                  </div>
                  <div className="grow">
                    <div className="small display">{def.name}</div>
                    <div className="xsmall dim">×{o.amount} fragments</div>
                  </div>
                </div>
                <button className="btn gold small" disabled={bought || game.resources.gold < o.gold} onClick={() => store.buyOffer(o.id)}>
                  {bought ? 'Bought' : (
                    <>
                      <Icon name="gold" size={16} /> {formatNumber(o.gold)}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h2>Chests</h2>
        <p className="small dim">Odds are shown before you buy. Chests never contain anything that replaces or removes what you own.</p>
        <div className="col">
          {(['silver', 'gold', 'legend'] as ChestKind[]).map((k) => (
            <ChestRow key={k} kind={k} />
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Glory Exchange</h2>
          <span className="res">
            <Icon name="glory" /> {formatNumber(game.resources.glory)}
          </span>
        </div>
        <p className="small dim">Duplicate fragments of max-level cards turn into Glory. Spend it on fragments of any card you have discovered.</p>
        <div className="row">
          <select className="field grow" value={gloryCard} onChange={(e) => setGloryCard(e.target.value)} aria-label="Card to buy with glory">
            {discoverableCards(game).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({RARITY_NAME[c.rarity]})
              </option>
            ))}
          </select>
          <button className="btn purple small" disabled={game.resources.glory < gloryPrice(gloryCard)} onClick={() => store.buyGlory(gloryCard)}>
            1 for {gloryPrice(gloryCard)}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChestRow({ kind }: { kind: ChestKind }) {
  const { game } = useGame();
  const odds = chestOdds(game, kind);
  const gold = chestPrice(kind, 'gold', game);
  const gems = chestPrice(kind, 'gems', game);
  const [open, setOpen] = useState(false);
  return (
    <div className="list-item col" style={{ alignItems: 'stretch' }}>
      <div className="row">
        <Icon name="chest" size={34} />
        <div className="grow">
          <div className="display">{CHEST_NAMES[kind]}</div>
          <div className="xsmall dim">
            {odds.totalFragments} fragments · {Math.round(odds.itemChance * 100)}% gear
          </div>
        </div>
        <button className="btn ghost small" onClick={() => setOpen(!open)} aria-expanded={open}>
          Odds
        </button>
      </div>
      {open && (
        <div className="small">
          {odds.rarity.map((r) => (
            <div key={r.rarity} className="stat-row">
              <RarityTag rarity={r.rarity} />
              <span>{(r.chance * 100).toFixed(1)}% per stack</span>
            </div>
          ))}
          <div className="stat-row">
            <span>Gear item</span>
            <span>{Math.round(odds.itemChance * 100)}%</span>
          </div>
          {odds.petChance > 0 && (
            <div className="stat-row">
              <span>Pet star (owned pet)</span>
              <span>{Math.round(odds.petChance * 100)}%</span>
            </div>
          )}
          <div className="stat-row">
            <span>Fragment stacks</span>
            <span>{odds.stacks}</span>
          </div>
        </div>
      )}
      <div className="row">
        {gold > 0 && (
          <button className="btn gold small grow" disabled={game.resources.gold < gold} onClick={() => store.buyChest(kind, 'gold')}>
            <Icon name="gold" size={16} /> {formatNumber(gold)}
          </button>
        )}
        <button className="btn purple small grow" disabled={game.resources.gems < gems} onClick={() => store.buyChest(kind, 'gems')}>
          <Icon name="gem" size={16} /> {gems}
        </button>
      </div>
    </div>
  );
}

export function CardModal({ id }: { id: string }) {
  const { game } = useGame();
  const def = getCard(id);
  const p = game.cards[id];
  const check = checkCardUpgrade(game, id);
  const level = p?.level ?? 1;
  const cur = cardStats(def, level);
  const next = cardStats(def, Math.min(BALANCE.cards.maxLevel, level + 1));
  const inDeck = game.deck.includes(id);
  const maxed = level >= BALANCE.cards.maxLevel;
  const unlockText = def.unlock.kind === 'stage' ? `Clear stage ${def.unlock.world + 1}-${def.unlock.stage}, or find fragments in chests once you reach World ${def.unlock.world + 1}.` : 'Starter card.';
  return (
    <ModalShell label={def.name} onClose={() => store.closeModal()}>
      <div className="stack-m">
        <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
          <div className={`card-detail-art rarity-${def.rarity}`}>
            <CardArt cardId={id} width={110} animate />
          </div>
          <div className="grow col" style={{ gap: 4 }}>
            <RarityTag rarity={def.rarity} />
            <h2>{def.name}</h2>
            <div className="row wrap">
              <span className="chip">{ROLE_LABEL[def.role]}</span>
              <span className="chip" style={{ color: '#e0434b' }}>
                {def.cost} valor
              </span>
              {def.count > 1 && <span className="chip">×{def.count} units</span>}
              {def.flying && <span className="chip blue">Flying</span>}
            </div>
            {p && (
              <div className="small">
                Level <b className="display">{level}</b> / {BALANCE.cards.maxLevel}
              </div>
            )}
          </div>
        </div>
        <p className="small dim" style={{ margin: 0 }}>
          {def.description}
        </p>
        <div className="panel dark">
          <div className="display gold-text">{def.abilityName}</div>
          <div className="small">{def.abilityText}</div>
        </div>
        <table className="compare-table">
          <tbody>
            <tr>
              <td className="dim">Stat</td>
              <td className="dim">Now</td>
              <td className="dim">{maxed ? '' : 'Next'}</td>
            </tr>
            <tr>
              <td>Health</td>
              <td>{formatNumber(cur.hp)}</td>
              <td className="up">{maxed ? '' : `${formatNumber(next.hp)} ▲`}</td>
            </tr>
            <tr>
              <td>Damage</td>
              <td>{formatNumber(cur.damage)}</td>
              <td className="up">{maxed ? '' : `${formatNumber(next.damage)} ▲`}</td>
            </tr>
            <tr>
              <td>Damage / sec</td>
              <td>{cur.dps}</td>
              <td className="up">{maxed ? '' : `${next.dps} ▲`}</td>
            </tr>
            <tr>
              <td>Attack speed</td>
              <td>{def.attackInterval}s</td>
              <td />
            </tr>
            <tr>
              <td>Range</td>
              <td>{def.range >= 10 ? `${def.range} (ranged)` : 'Melee'}</td>
              <td />
            </tr>
            <tr>
              <td>Targets</td>
              <td>{[def.targetsGround && 'Ground', def.targetsAir && 'Air'].filter(Boolean).join(' + ') || 'Allies (healer)'}</td>
              <td />
            </tr>
            <tr>
              <td>Damage type</td>
              <td style={{ textTransform: 'capitalize' }}>{def.damageType}</td>
              <td />
            </tr>
          </tbody>
        </table>
        <div className="grid-2 small">
          <div>
            <div className="good-text display">Synergies</div>
            {def.synergies.map((s) => (
              <div key={s} className="dim">
                + {s}
              </div>
            ))}
          </div>
          <div>
            <div className="warn-text display">Weak against</div>
            {def.weaknesses.map((s) => (
              <div key={s} className="dim">
                − {s}
              </div>
            ))}
          </div>
        </div>
        {p ? (
          <>
            {!maxed && (
              <div className="col" style={{ gap: 4 }}>
                <div className="spread small">
                  <span>Fragments</span>
                  <span>
                    {p.fragments} / {fragmentsForUpgrade(def.rarity, level)}
                  </span>
                </div>
                <Bar value={p.fragments} max={fragmentsForUpgrade(def.rarity, level)} tone={p.fragments >= fragmentsForUpgrade(def.rarity, level) ? 'green' : 'blue'} />
              </div>
            )}
            {maxed && <div className="notice info small">Max level! Extra fragments of this card turn into Glory tokens.</div>}
            <div className="row">
              <button className={`btn ${inDeck ? 'ghost' : 'green'} grow`} onClick={() => store.toggleDeck(id)}>
                {inDeck ? 'Remove from deck' : 'Add to deck'}
              </button>
              {!maxed && (
                <button className="btn gold grow" disabled={!check.ok} onClick={() => store.upgradeCard(id)}>
                  <Icon name="up" size={18} /> {formatNumber(check.gold)}
                </button>
              )}
            </div>
            {!check.ok && check.reason === 'gold' && <div className="xsmall warn-text center">Need {formatNumber(check.gold)} gold.</div>}
            <p className="xsmall faint center" style={{ margin: 0 }}>
              Upgrading never consumes the card itself. Cards are never lost.
            </p>
          </>
        ) : (
          <div className="notice">{unlockText}</div>
        )}
      </div>
    </ModalShell>
  );
}
