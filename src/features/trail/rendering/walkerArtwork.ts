import { Graphics } from 'pixi.js';

/** Ilustração vetorial local. O tamanho da mochila representa somente a carga. */
export function drawWalker(color: number, loadKg: number): Graphics {
  const packHeight = 10 + Math.min(12, Math.max(0, loadKg) * 0.6);
  return new Graphics()
    .ellipse(0, 13, 13, 3).fill({ color: 0x18382c, alpha: 0.12 })
    .moveTo(-3, 4).lineTo(-6, 12).moveTo(3, 4).lineTo(7, 12)
    .stroke({ color: 0x273d38, width: 3, cap: 'round' })
    .roundRect(-12, 5 - packHeight, 10, packHeight, 3)
    .fill(0x9b713d).stroke({ color: 0x624623, width: 1 })
    .roundRect(-5, -6, 12, 13, 4).fill(color)
    .moveTo(5, -2).lineTo(11, 3).lineTo(14, 1)
    .stroke({ color: 0x273d38, width: 2, cap: 'round' })
    .moveTo(14, -2).lineTo(13, 13).stroke({ color: 0x705636, width: 1.5 })
    .circle(2, -12, 5).fill(0xe7b68b)
    .roundRect(-4, -18, 11, 4, 2).fill(color)
    .moveTo(-5, -14).lineTo(10, -14).stroke({ color, width: 2 });
}
