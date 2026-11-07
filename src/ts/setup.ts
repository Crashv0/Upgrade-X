import { createUpgradeBox } from './box';

export function setup(ctx: Modding.ModContext) {
  const box = createUpgradeBox();

  ctx
    .patch(ItemUpgradeMenuElement, 'setUpgrade')
    .after(function (_returned, upgrade, _rootItem, bank) {
      box.show(upgrade, bank);
    });

  // The modal exists only once the interface has loaded. The box goes at the end
  // of the block holding the game's 1/10/100/1000/All buttons.
  ctx.onInterfaceReady(() => {
    const buttons = itemUpgradeMenu.upgradeButtons[0]?.button.parentElement;
    if (!buttons) return;
    const host = document.createElement('div');
    buttons.append(host);
    box.mount(host);
  });
}
