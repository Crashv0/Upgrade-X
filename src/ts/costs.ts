const times = <T extends { quantity: number }>(costs: T[], n: number): T[] =>
  costs.map((cost) => ({ ...cost, quantity: cost.quantity * n }));

/**
 * Redraws the upgrade modal's Cost row for `quantity` upgrades with the game's
 * own rendering, so icons, tooltips, number format and the can-afford colours
 * match the game's. The game draws whatever cost lists the upgrade holds, so
 * they are swapped for scaled copies just for the call; nothing else runs in
 * between, and the originals are always put back.
 */
export function drawCosts(upgrade: ItemUpgrade, bank: Bank, quantity: number) {
  const { currencyCosts, itemCosts } = upgrade;
  upgrade.currencyCosts = times(currencyCosts, quantity);
  upgrade.itemCosts = times(itemCosts, quantity);
  try {
    itemUpgradeMenu.setUpgradeCosts(upgrade, bank, game);
  } finally {
    upgrade.currencyCosts = currencyCosts;
    upgrade.itemCosts = itemCosts;
  }
}
