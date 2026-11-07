import { drawCosts } from './costs';

/** What the box upgrades: the upgrade the modal shows and the bank it draws from. */
interface Target {
  upgrade: ItemUpgrade;
  bank: Bank;
}

const DIGITS = /^\d*$/;
const MODAL = '#modal-item-upgrade';

/**
 * The quantity box and button under the game's upgrade buttons. Its view state
 * lives in a petite-vue store so the patch and the template both see changes;
 * the game objects stay outside it, so the store never wraps them in proxies.
 */
export function createUpgradeBox() {
  let target: Target | undefined;

  const state = ui.createStore({
    text: '',
    max: 0,
    requirementMet: true,
    isDowngrade: false,

    get quantity(): number | undefined {
      return this.text === '' ? undefined : Number.parseInt(this.text, 10);
    },

    /** Whether the typed quantity can be upgraded right now. */
    get canUpgrade(): boolean {
      const n = this.quantity;
      return n !== undefined && n >= 1 && n <= this.max && this.requirementMet;
    },

    /** Shown under the box when the typed quantity is more than affordable. */
    get maxHint(): string {
      const n = this.quantity;
      return n !== undefined && n > this.max
        ? `max ${numberWithCommas(this.max)}`
        : '';
    },

    get label(): string {
      const action = this.isDowngrade
        ? getLangString('MENU_TEXT_DOWNGRADE')
        : 'Upgrade';
      return `${action} ${this.quantity ?? 'x'}`;
    },

    onInput(event: Event) {
      if (!(event.target instanceof HTMLInputElement)) return;
      const text = event.target.value;
      if (!DIGITS.test(text)) {
        event.target.value = this.text;
        return;
      }
      this.text = text;
      if (target === undefined) return;
      // An empty box or 0 shows the game's costs for one upgrade.
      const n = this.quantity;
      drawCosts(target.upgrade, target.bank, n !== undefined && n >= 1 ? n : 1);
    },

    upgrade() {
      const n = this.quantity;
      if (target === undefined || n === undefined || !this.canUpgrade) return;
      target.bank.upgradeItemOnClick(target.upgrade, n);
      $(MODAL).modal('hide');
    },
  });

  return {
    /** Mounts the box into `host`, once the modal exists. */
    mount(host: Element) {
      ui.create({ $template: '#upgrade-x', box: state }, host);
    },

    /** Called each time the modal opens with an upgrade. */
    show(upgrade: ItemUpgrade, bank: Bank) {
      target = { upgrade, bank };
      state.text = '';
      state.max = bank.getMaxUpgradeQuantity(upgrade);
      state.requirementMet = bank.checkUpgradePotionRequirement(upgrade);
      state.isDowngrade = upgrade.isDowngrade;
    },
  };
}
