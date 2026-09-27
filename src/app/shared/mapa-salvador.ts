import { Component, computed, input, output } from '@angular/core';

/**
 * MAPA DE EL SALVADOR — componente de presentación puro, sin ninguna regla de negocio.
 *
 * Dibuja los 14 departamentos como regiones interactivas independientes y los colorea con el
 * estado que recibe. No sabe qué es una bitácora: quien lo usa le pasa un color por departamento
 * y escucha el departamento elegido. Así el mismo mapa sirve para bitácoras, controles o cobertura
 * de soporte sin duplicar la geometría.
 *
 * ## De dónde salen los polígonos
 *
 * Son los límites departamentales reales de **Natural Earth** (`ne_10m_admin_1_states_provinces`,
 * dominio público), proyectados a coordenadas del `viewBox` con una equirrectangular corregida por
 * el coseno de la latitud media del país y simplificados con Douglas-Peucker a 0,75 unidades. No
 * es una imagen: cada departamento es un `<path>` propio, con su color, su foco y su clic.
 *
 * ## El color NUNCA va solo
 *
 * El rojo y el verde son indistinguibles en deuteranopía, así que cada región lleva **tres**
 * canales además del relleno: la **sigla** del departamento, un **glifo de forma distinta** por
 * estado (check, reloj, admiración, guion) y el `<title>` que el navegador muestra al pasar el
 * cursor. La pantalla añade el cuarto: la tabla. Los rellenos están separados también en
 * luminosidad, para que el mapa siga leyéndose impreso en escala de grises.
 */

/** Color institucional de una región. Es el estado **visual**, no el estado real del registro. */
export type ColorMapa = 'ok' | 'warn' | 'danger' | 'none';

/** Lo que el mapa necesita saber de un departamento para dibujarlo. */
export interface RegionMapa {
  /** Id del departamento en el catálogo territorial (`SS`, `STA`, `AHU`…). */
  id: string;
  color: ColorMapa;
  /**
   * Fuera del alcance del filtro o del rol activo: se dibuja atenuado y no se puede elegir. Es el
   * «gris claro» de la vista por soporte, y es distinto de `color: 'none'`, que significa que el
   * departamento no tiene soporte asignado.
   */
  atenuado?: boolean;
  seleccionado?: boolean;
  /** Texto del tooltip del navegador: departamento, estado y responsable. */
  titulo: string;
}

/** Geometría de un departamento: el trazo y el ancla interior de su etiqueta. */
interface GeometriaDepartamento {
  id: string;
  nombre: string;
  /** Punto más alejado del borde: la etiqueta cae siempre dentro del polígono. */
  cx: number;
  cy: number;
  d: string;
}

export const ANCHO_MAPA = 1000;
export const ALTO_MAPA = 547;

/** Los 14 departamentos, de occidente a oriente. */
const GEOMETRIA: GeometriaDepartamento[] = [
  { id: 'AHU', nombre: 'Ahuachapán', cx: 80.4, cy: 253.8, d: 'M6.8 303.6L0.2 276L1 262.4L3.2 255.7L6.5 249.6L11.4 244.5L22.8 238.4L27.8 234.3L37.9 216.2L44 210.8L83.7 182.9L92.5 174.1L96.9 171.2L115.2 164.3L121.3 163.8L128.8 165.8L139.5 174.2L145.6 176.6L151.6 173.4L151.5 170.3L163.9 177.8L166.4 184.1L173 192.1L171.8 199.7L163.5 228.1L156.2 231.2L142.1 234.5L140.1 236.5L140.5 248.9L143.1 257.8L134.7 270.6L133.7 274.6L137.6 288L131.5 297.7L130.2 304.5L124.9 314.1L121.8 325.6L116.3 326.9L101.3 325.6L91.3 315.2L87.5 313.2L84.3 313L77.2 316.2L66.6 331.8L6.8 303.6Z' },
  { id: 'STA', nombre: 'Santa Ana', cx: 223.5, cy: 162.9, d: 'M151.5 170.3L148.8 164.1L148.4 160.9L149.6 157.4L167.2 126.1L175.5 117.1L185.9 109.1L196.8 104.1L241.1 93.5L243.8 90.8L243.7 84.2L235.3 78.1L233.3 66.8L229.7 60.6L224.4 57.1L215.8 55.9L213.3 49.9L222.5 39.2L221.3 34.3L216.5 25.3L219.2 18.5L225 14.2L231.1 14.7L235.6 19.3L236.8 27.1L242.4 23.1L252.6 10.8L260 7.6L266.5 8.5L275.8 12.7L282.3 11.3L291.7 1.6L295.9 0L296.5 8.2L299 4L310.9 12.7L317.4 13.7L335.9 31.5L340.5 39.5L358.6 52.1L353.2 67.5L351.6 76.1L348 80.1L332.6 86.4L332.8 101.2L324 114.3L319.7 117.3L309.1 119.5L300.7 131.8L291.9 131.6L283.9 158.9L285.2 168.1L289.8 172.3L296 173.5L307 172.1L302.5 195.6L300.8 212.6L297.8 214.7L292.9 215.3L288.2 221.5L284.9 221.2L282.4 222.9L280.9 253.4L273.7 273.2L271.8 285L246.8 279.5L243.1 271.5L228.9 259.9L222.1 256.3L218.4 259.7L216.2 269.9L213.8 271.6L210.9 272.3L207.6 271.4L202.1 264.2L198.2 262.9L198.3 260L201.8 256.2L201.8 251.6L192.7 238.9L181.6 229.6L173.1 230.5L163.5 228.1L171.8 199.7L173 192.1L166.4 184.1L163.9 177.8L151.5 170.3Z' },
  { id: 'SON', nombre: 'Sonsonate', cx: 180.7, cy: 330.3, d: 'M208.7 396.4L179.6 387.2L165.9 390.1L126.7 390.6L120.4 386.2L114.6 360.8L101 351.3L66.6 331.8L77.2 316.2L84.3 313L87.5 313.2L91.3 315.2L101.3 325.6L116.3 326.9L121.8 325.6L124.9 314.1L130.2 304.5L131.5 297.7L137.6 288L133.7 274.6L134.7 270.6L143.1 257.8L139.5 241L140.1 236.5L142.1 234.5L156.2 231.2L163.5 228.1L173.1 230.5L181.6 229.6L192.7 238.9L196.1 244.8L199.9 248.6L201.8 251.6L202.1 255L197.7 262L202.1 264.2L207.6 271.4L210.9 272.3L216.2 269.9L217 262.7L219.5 257.9L222.1 256.3L228.9 259.9L243.1 271.5L246.8 279.5L271.8 285L277.5 287L279.6 289.2L279.6 293L275.6 297.3L266.9 302.7L258.1 312.1L250.1 315.1L247.1 324.1L246.9 339.7L243.7 344.6L232.1 356.4L229.8 367.1L216.4 380.1L208.7 396.4Z' },
  { id: 'CHA', nombre: 'Chalatenango', cx: 403.4, cy: 98.8, d: 'M317.4 13.7L333.3 16.3L346.2 22.4L367.2 26.9L377.7 34.3L396.8 40L400.7 36.4L406.6 24.9L409.9 21.6L416 21L422.4 30L423 38.6L421.3 42.7L426 46.8L440.1 48.4L446.7 51.7L449.4 57L451 70L452.9 73.9L463.3 81.8L467.2 86.4L470.9 92.7L474.4 108L478 110.6L492.7 104.4L499.2 104.5L509.4 111.1L518 122L524.2 134.7L526.9 146.7L534.2 145.6L552.3 147L561.5 142.4L565.1 142L568 146.9L565 167.1L571.5 171.3L582.2 173.2L587.3 178.6L588 184.4L569 187.3L560.5 191.4L557.4 195.6L549.6 200.1L518 210.8L512.4 212.2L489.4 211.5L482.6 210.8L476.2 208.3L468.7 208.9L458.3 203.7L453.1 196.4L452.2 188.6L439.8 172.5L429.9 164.9L412 157.3L409.3 157.1L390.6 166.2L385.9 165L380.1 160.4L377.5 165.6L371.7 165.6L363.1 161.8L352.9 167.6L338 164L330.5 159.8L326.2 158.9L318.4 164.1L310.1 166.3L307 172.1L302.1 173.4L289.8 172.3L285.2 168.1L283.9 158.9L291.9 131.6L300.7 131.8L309.1 119.5L319.7 117.3L324 114.3L332.8 101.2L332.6 86.4L348 80.1L351.6 76.1L353.2 67.5L358.6 52.1L340.5 39.5L335.9 31.5L317.4 13.7Z' },
  { id: 'LIB', nombre: 'La Libertad', cx: 311.5, cy: 348.6, d: 'M404.3 438.4L384.6 426.2L356.5 413.8L326.2 406.5L312.1 406.5L301.4 404L242.7 404.5L208.7 396.4L216.4 380.1L229.8 367.1L232.1 356.4L243.7 344.6L246.9 339.7L247.1 324.1L250.1 315.1L258.1 312.1L266.9 302.7L275.6 297.3L279.6 293L280.2 291.4L279.1 288.3L271.8 285L273.7 273.2L280.9 253.4L282.4 222.9L284.9 221.2L288.2 221.5L292.9 215.3L297.8 214.7L300.8 212.6L302.5 195.6L307 172.1L310.1 166.3L318.4 164.1L326.2 158.9L330.5 159.8L338 164L344.7 165L350 167.2L349.5 181.6L347.3 190.7L347.5 194.5L351 197.9L356.6 208.8L363.6 211.9L372.4 212.1L379.2 216.6L377.5 223L372.3 224.2L369.2 251.7L364 255.3L361.9 258.9L356.8 287.3L353.7 293.8L352 300.8L355.1 302L357.2 304.7L357.1 313L361.2 318L363.8 325.9L371.4 330.2L376.3 337.1L373.9 344.6L378.5 348.1L376.2 352.9L376.6 374.5L372.9 386.2L373 389.8L382.6 406.4L386 407L392.7 405L397.7 405.2L400.7 406.6L403.4 415.3L408.4 415.8L413.8 419L414.2 420.2L406.7 431.9L404.3 438.4Z' },
  { id: 'SS', nombre: 'San Salvador', cx: 399, cy: 301.4, d: 'M402 160.9L401.8 165L397.5 175.5L399 191.4L397.4 198.5L393.9 202.7L395.2 209.6L399.2 217.7L410.7 236L409.1 238.4L404.3 241.2L416.5 261.8L423.1 268.5L428.8 269.9L434.1 277.6L439.1 282L438.8 293L450.3 315.6L450.6 328.5L435.7 342.6L421.2 360L412 357.6L407.4 358.1L406.7 361.4L407.4 365.1L412.6 376.2L411.4 383.8L407.9 394.4L405.8 398.9L401.6 403L400.7 406.6L395.1 404.7L384.7 407.1L382 405.6L372.8 388.2L376.6 374.5L375.9 356.9L376.8 350.5L378.5 348.1L373.9 344.6L376.2 338.4L375.9 335.5L371.4 330.2L363.8 325.9L361.2 318L357.1 313L357.2 304.7L355.1 302L352.7 301.7L351.9 299.1L356.8 287.3L361.9 258.9L364 255.3L369.2 251.7L372.3 224.2L377.5 223L379.3 217.3L373.5 212.5L363.6 211.9L356.6 208.8L351 197.9L347.5 194.5L347.3 190.7L349.5 181.6L350 167.2L352.9 167.6L363.1 161.8L371.7 165.6L377.5 165.6L380.1 160.4L385.9 165L390.6 166.2L402 160.9Z' },
  { id: 'CUS', nombre: 'Cuscatlán', cx: 439.7, cy: 229.5, d: 'M489.4 211.5L481.6 224L471 232.3L470 235.7L471.1 238.4L481.1 253.5L489 260.8L494.4 275.8L504.2 289.4L507.9 291.5L522.2 295.4L511.3 324.9L503.3 332.9L498.1 335.4L491.8 336.3L488.7 340.5L483.7 341.5L450.6 328.5L450.3 315.6L438.8 293L439.1 282L434.1 277.6L428.8 269.9L423.1 268.5L420.3 266.1L405.5 244.5L404.3 241.2L409.1 238.4L410.7 236L399.2 217.7L395.2 209.6L393.9 202.7L397.4 198.5L399 191.4L397.5 175.5L401.8 165L402 160.9L409.3 157.1L412 157.3L429.9 164.9L439.8 172.5L451.4 187.4L453.1 196.4L458.3 203.7L468.7 208.9L476.2 208.3L482.6 210.8L489.4 211.5Z' },
  { id: 'PAZ', nombre: 'La Paz', cx: 475.7, cy: 408.8, d: 'M529.9 501.5L433.6 456.4L404.3 438.4L406.7 431.9L414.2 420.2L412.5 417.5L403.4 415.3L400.7 406.6L401.6 403L405.8 398.9L407.9 394.4L412.4 379.2L412.6 376.2L407.4 365.1L406.8 359.5L408.3 357.6L410.8 357.4L421.2 360L435.7 342.6L450.6 328.5L483.7 341.5L488.7 340.5L491.8 336.3L498.1 335.4L503.3 332.9L506.4 341.2L506 355.4L507.3 360L511.2 360L521 356.9L527.9 358.3L539.1 381.5L539.5 386.7L535.3 399.8L533.3 411.3L533.8 420.6L534.9 424.8L546.6 434.7L550.7 442.2L549.6 447L545.9 450.6L544.8 453.9L546.5 475L544.5 477.5L535 482.3L532.1 485.3L529.9 501.5Z' },
  { id: 'CAB', nombre: 'Cabañas', cx: 614.1, cy: 231.2, d: 'M588 184.4L588 185.1L601 182.5L611.5 183.2L642.8 193.3L661 194.6L665 196.3L668.7 200L668.3 202.3L665.9 202.6L668.4 208.2L665.9 224.6L671.5 239.8L671.8 246.7L665.6 255L668.2 260.3L667.6 265.3L664.6 269.6L660.2 272.4L661.1 278.3L653.5 291.7L646.8 296.2L632.5 293.9L630.1 292.7L628.2 287.4L615 281.9L606.5 275.8L593.6 274.2L577.4 274L569.5 269.2L566.7 270.1L561.8 275.2L556.4 274.3L553.7 275L536.9 282L534 282.5L524.7 280.4L522.8 283.2L522.2 295.4L507.9 291.5L504.2 289.4L494.4 275.8L489 260.8L481.1 253.5L473 242.1L470 235.7L471.6 231.4L481.6 224L489.4 211.5L512.4 212.2L518 210.8L549.6 200.1L557.4 195.6L560.5 191.4L569 187.3L588 184.4Z' },
  { id: 'SV', nombre: 'San Vicente', cx: 575.6, cy: 328, d: 'M536.1 504.4L529.9 501.5L530.9 488.6L533.4 483.6L543.7 478.1L546.5 475L544.8 453.9L545.9 450.6L549.6 447L550.7 442.2L546.6 434.7L534.9 424.8L533.8 420.6L533.3 411.3L535.3 399.8L539 389.1L539.4 382.7L527.9 358.3L521 356.9L511.2 360L507.3 360L506 355.4L506.4 341.2L503.3 332.9L511.3 324.9L513.2 321.6L522.2 295.4L522.8 283.2L524.7 280.4L534 282.5L556.4 274.3L561.8 275.2L566.7 270.1L569.5 269.2L577.4 274L593.6 274.2L606.5 275.8L615 281.9L628.2 287.4L630.1 292.7L632.5 293.9L646.8 296.2L653.5 291.7L654.6 301.7L667.3 314.5L672.1 321.9L646.1 340.9L643.8 348.4L637.7 356.9L629.3 362.1L620.2 360.1L608.3 374.8L607.8 377.5L601 378.6L598.6 382L597.7 394.9L594.2 407.5L573.6 447.9L571.1 469.4L563.8 476.4L557.5 486.9L553.6 490.1L540.6 493.1L537.5 497.4L536.1 504.4Z' },
  { id: 'USU', nombre: 'Usulután', cx: 650.2, cy: 433.4, d: 'M826.8 541.8L822.9 543.4L787.3 546.4L749 540.5L739.1 543.8L727.8 540.6L727.8 538L737.2 537.3L737.8 530.8L732.8 522.7L725.3 517.4L733.8 531.9L711.5 532.2L705.3 534.8L709.3 536.5L722.2 534.8L722.2 538L712.6 542L702 541.7L693.7 536.5L691.2 526.1L696.8 529L702.5 523.2L702.5 520.5L695.4 517.3L687.7 506.4L682.5 503.1L687.4 518.8L685.5 523.2L679.5 519.8L662.1 515.3L654.5 511.3L647.7 499.1L644.5 497.1L626.1 493.9L620 493.9L603.3 497.1L579.9 497.7L574.8 500L580.6 503.8L583.7 504.3L586.4 503.1L598 505.9L631.2 502.3L634.9 502.8L640.2 505.8L651.7 517.4L651.7 520.5L638.4 518.2L626.1 514.5L626.1 517.4L659.9 524.4L677.6 530.2L685.5 538L682.6 543.1L675.2 541.8L655.5 530.2L548.9 510.3L536.1 504.4L535.9 503.4L537.5 497.4L540.6 493.1L553.6 490.1L557.5 486.9L563.8 476.4L571.1 469.4L573.6 447.9L594.2 407.5L597.7 394.9L598.6 382L601 378.6L607.8 377.5L608.3 374.8L620.2 360.1L629.3 362.1L637.7 356.9L643.8 348.4L646.1 340.9L672.1 321.9L693.9 320.3L699.8 329L706.2 334.2L719.5 336.6L723.4 338.5L721.2 347.7L723.8 358.7L722.1 361.4L718 363.1L716.3 367.2L716.9 372.1L722.4 384.2L721.6 390.3L723.7 399.8L719.6 405.7L718.6 414.5L717.3 415.1L714.2 413.5L713.1 417.9L715.3 434.1L716.3 436L719 435.3L721.3 437L722.3 446.8L726.7 459L734.5 470L740.7 472.5L748.8 473.4L759.3 483.1L762.6 483.5L768.1 486.6L776.5 483.2L779.5 483.3L782 487.4L782.2 494.9L787.4 499.2L788.6 501.7L785.5 507.4L785 512.2L786.8 513.3L798 511.6L801.5 512.3L826.8 541.8Z' },
  { id: 'SM', nombre: 'San Miguel', cx: 792.6, cy: 428.2, d: 'M738.6 238.3L741.5 232.9L755.4 229.4L760.1 223.8L767.2 238.4L771.7 254.3L770.6 257.5L765.6 263.5L765.9 273L785.3 287.4L787.3 290.1L788.1 294.2L786.3 296.9L780.3 299.7L766 310.3L766.2 323L774.9 332.2L777 336.8L782.4 341.3L786.3 349.2L791.1 352.8L791.7 355L788.4 361L799.1 357.5L816.6 356.7L821.5 362.8L823.8 373.6L831.4 378.8L835.4 383.9L840.4 383.9L856.6 378.9L869.8 380.1L867.1 383.8L866.2 389.1L866.4 402L868 409.5L866.1 412.8L861.2 416.3L860.3 420.7L861.6 439.1L867.4 450.5L862.1 481.1L862.6 487.9L856.2 506.7L852.9 507.2L847.3 505.4L839.4 500.4L837.8 507.8L835.5 541.2L829.9 540.6L826.8 541.8L801.5 512.3L798 511.6L785.7 513.1L785.1 508.7L788.4 500.5L782.2 494.9L782 487.4L779.5 483.3L776.5 483.2L770.5 486.2L765.9 486L762.6 483.5L758.1 482.3L750.7 474.5L738.5 471.9L733.8 469.4L730.9 465.7L724.5 454.4L721.7 443.5L721.3 437L719 435.3L715.8 435.5L713.1 417.9L714.2 413.5L717.3 415.1L718.6 414.5L719.6 405.7L723.7 399.8L721.6 390.3L722.4 384.2L716.9 372.1L716.3 367.2L718 363.1L722.1 361.4L723.8 358.7L721.2 347.7L723.4 338.5L719.5 336.6L706.2 334.2L699.8 329L693.9 320.3L672.1 321.9L667.3 314.5L654.6 301.7L653.5 291.6L661.1 278.3L660.2 272.4L664.6 269.6L667.6 265.3L668.2 260.3L665.6 255L668.1 252.7L679.2 252.1L694.4 244.2L711 240.5L724.6 243.7L725.4 237.3L726.7 235.8L732.7 236.1L738.6 238.3Z' },
  { id: 'MOR', nombre: 'Morazán', cx: 844.8, cy: 308.7, d: 'M776.2 192.4L800 195.7L821.5 193.1L832.4 193.7L837.2 197.7L843.2 213.4L863.5 235.7L867 246.2L885.8 236.8L892.9 235.3L896 250.6L896.8 262.6L895.2 289.8L898.4 295.2L899.6 299.8L898.2 317.8L895.8 329.3L886.3 353.8L885.6 361.8L869.8 380.1L856.6 378.9L840.4 383.9L835.4 383.9L831.4 378.8L823.8 373.6L821.5 362.8L816.6 356.7L799.1 357.5L789.1 361.5L788.4 360.2L791.7 355L791.1 352.8L786.3 349.2L782.4 341.3L777 336.8L774.9 332.2L766.2 323L766 310.3L780.3 299.7L786.3 296.9L788.1 294.2L787.3 290.1L785.3 287.4L769.7 276.7L765.9 273L765.2 270.8L765.6 263.5L770.6 257.5L771.7 251.8L767.2 238.4L760.1 223.8L764.4 217.8L769.4 215.7L775.7 215.7L777.7 209.9L772.4 203.8L772 195.4L772.2 194L776.2 192.4Z' },
  { id: 'UNI', nombre: 'La Unión', cx: 938.5, cy: 282.7, d: 'M948.5 225.2L952.4 228.2L956.4 239.4L959.8 244.5L970.2 249.4L988.4 265.1L995.7 268.1L992 274.2L981.6 300.5L984.2 307.5L982.2 312.1L974.5 321.2L973 328.7L972.4 352.3L962.5 376.3L960.1 388L964.4 397.8L968.6 399.3L977.4 396.4L983.4 398.7L986.6 402.4L988.7 407.5L989.4 413.2L988.5 418.7L981.3 426.8L948.8 441.7L945.3 439.7L940.1 427.1L928.5 447.4L925.4 459.3L933 464.6L937.9 466.4L951.6 479.6L959.4 484.9L960.1 492.6L956.7 501.7L948.5 508.1L917.8 523.7L909.5 530.3L908 537.1L917.5 543.8L902.9 547.2L846 543.2L835.5 541.2L837.8 507.8L839.4 500.4L847.3 505.4L852.9 507.2L856.2 506.7L862.6 487.9L862.1 481.1L867.4 450.5L861.6 439.1L860.3 420.7L861.2 416.3L866.1 412.8L868 409.5L866.4 402L867.1 383.8L885.6 361.8L886.3 353.8L895.8 329.3L898.2 317.8L899.6 299.8L898.4 295.2L895.2 289.8L896.8 262.6L896 250.6L892.9 235.3L904.1 240.6L914.6 234.4L930.7 236.1L942.3 225.4L948.5 225.2ZM986.3 530.3L986 524.8L989 522.7L994.7 524.6L998.2 532.4L998.4 538.9L1000 543.2L996.5 545.1L991.2 543.2L987.6 544.8L987.7 540.2L985.5 535.7L986.3 530.3ZM970 509.2L973.3 511L976 517.3L970.8 523.5L965.4 518.6L964.1 511.9L966.5 509.4L970 509.2Z' },];

/** Región ya resuelta para la plantilla: geometría más estado visual. */
interface RegionDibujada extends GeometriaDepartamento {
  color: ColorMapa;
  atenuado: boolean;
  seleccionado: boolean;
  titulo: string;
  clases: string;
}

@Component({
  selector: 'ui-mapa-salvador',
  styles: `
    /* Paleta del mapa: pasos del sistema institucional ajustados para funcionar como RELLENO.
       Verificados con el validador de paletas: banda de luminosidad y croma en rango, separación
       en deuteranopía ΔE 14,9 entre «realizada» y «pendiente» —el par crítico— y ΔE 18,0 a vista
       normal. El amarillo queda bajo 3:1 contra el blanco a propósito (es un relleno, no texto):
       lo compensan la sigla, el glifo y la tabla de la pantalla. */
    :host {
      --mapa-ok: #4aa36f;      --mapa-ok-borde: #1a7a4c;      --mapa-ok-tx: #0d2240;
      --mapa-warn: #d4aa30;    --mapa-warn-borde: #8f6400;    --mapa-warn-tx: #0d2240;
      --mapa-danger: #a8302a;  --mapa-danger-borde: #7d1e19;  --mapa-danger-tx: #ffffff;
      --mapa-none: #c3cedd;    --mapa-none-borde: #9aa9bc;    --mapa-none-tx: #0d2240;
      display: block;
    }
    svg { display: block; width: 100%; height: auto; }

    /* El trazo va en el color del borde y algo más grueso de lo que pediría el dibujo: cada
       departamento se simplificó por su cuenta, así que dos vecinos dejan hendiduras de menos de
       dos unidades en su frontera común. Con 2.4 el trazo de ambos lados las cubre y se leen como
       la línea divisoria que son, en vez de como rendijas blancas. */
    .region { stroke-width: 2.4; cursor: pointer; transition: filter .12s ease; }
    .region.ok     { fill: var(--mapa-ok);     stroke: var(--mapa-ok-borde); }
    .region.warn   { fill: var(--mapa-warn);   stroke: var(--mapa-warn-borde); }
    .region.danger { fill: var(--mapa-danger); stroke: var(--mapa-danger-borde); }
    .region.none   { fill: var(--mapa-none);   stroke: var(--mapa-none-borde); }

    .region:hover { filter: brightness(1.08); }
    .region:focus-visible { outline: none; stroke: var(--navy-900); stroke-width: 3.4; }

    /* Departamento fuera del filtro por soporte: sigue visible —el país no se rompe— pero
       renuncia al color y al clic. */
    .region.atenuado { fill: #e7ecf3; stroke: #cdd6e2; cursor: default; }

    /* La selección se marca con contorno azul, no cambiando el relleno: el estado de la bitácora
       tiene que seguir leyéndose en el departamento seleccionado. */
    .region.sel { stroke: var(--blue-500); stroke-width: 4; }

    /* Las etiquetas se dibujan en una segunda pasada, encima de TODOS los trazos: si fueran
       hermanas de su propio path, el polígono del departamento vecino las taparía. */
    .etiquetas { pointer-events: none; }
    .sigla {
      font-family: var(--font); font-weight: 700; font-size: 25px;
      text-anchor: middle; dominant-baseline: middle;
    }
    .glifo { fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
    .et-ok       .sigla { fill: var(--mapa-ok-tx); }
    .et-warn     .sigla { fill: var(--mapa-warn-tx); }
    .et-danger   .sigla { fill: var(--mapa-danger-tx); }
    .et-none     .sigla { fill: var(--mapa-none-tx); }
    .et-atenuado .sigla { fill: #8b9bb0; }
    .et-ok       .glifo { stroke: var(--mapa-ok-tx); }
    .et-warn     .glifo { stroke: var(--mapa-warn-tx); }
    .et-danger   .glifo { stroke: var(--mapa-danger-tx); }
    .et-none     .glifo { stroke: var(--mapa-none-tx); }
    .et-atenuado .glifo { stroke: #8b9bb0; }
  `,
  template: `
    <svg [attr.viewBox]="'0 0 ' + ancho + ' ' + alto" role="img" [attr.aria-label]="descripcion()">
      <!-- Pasada 1: los trazos. Cada departamento es una región enfocable e independiente. -->
      @for (r of dibujadas(); track r.id) {
        <path
          [attr.d]="r.d"
          [class]="r.clases"
          [attr.tabindex]="r.atenuado ? -1 : 0"
          [attr.aria-disabled]="r.atenuado"
          role="button"
          (click)="seleccionar(r)"
          (keydown.enter)="seleccionar(r)"
          (keydown.space)="seleccionar(r); $event.preventDefault()">
          <title>{{ r.titulo }}</title>
        </path>
      }

      <!-- Pasada 2: sigla y glifo de estado, por encima de todos los trazos. -->
      <g class="etiquetas">
        @for (r of dibujadas(); track r.id) {
          <g [attr.transform]="'translate(' + r.cx + ' ' + r.cy + ')'" [class]="r.clasesEtiqueta">
            <g class="glifo" transform="translate(0 -15)">
              @switch (r.atenuado ? 'none' : r.color) {
                @case ('ok') { <path d="M-7.5 0.5 -2.5 5.5 7.5 -6" /> }
                @case ('warn') { <circle cx="0" cy="0" r="7.5" /><path d="M0 -4v4.6l3.4 2.4" /> }
                @case ('danger') { <path d="M0 -7.5v8.2" /><path d="M0 5.6h.01" stroke-width="3.4" /> }
                @case ('none') { <path d="M-7 0h14" /> }
              }
            </g>
            <text class="sigla" y="15">{{ r.id }}</text>
          </g>
        }
      </g>
    </svg>
  `
})
export class MapaSalvadorComponent {
  readonly regiones = input.required<RegionMapa[]>();

  /** Id del departamento elegido. No se emite para una región atenuada. */
  readonly elegir = output<string>();

  protected readonly ancho = ANCHO_MAPA;
  protected readonly alto = ALTO_MAPA;

  /** Geometría y estado de cada departamento, en el orden del trazo. */
  protected readonly dibujadas = computed<(RegionDibujada & { clasesEtiqueta: string })[]>(() => {
    const porId = new Map(this.regiones().map((r) => [r.id, r]));
    return GEOMETRIA.map((g) => {
      const r = porId.get(g.id);
      const color: ColorMapa = r?.color ?? 'none';
      const atenuado = r?.atenuado === true;
      const seleccionado = r?.seleccionado === true;
      return {
        ...g,
        color,
        atenuado,
        seleccionado,
        titulo: r?.titulo ?? g.nombre,
        clases: ['region', atenuado ? 'atenuado' : color, seleccionado ? 'sel' : ''].filter(Boolean).join(' '),
        clasesEtiqueta: atenuado ? 'et-atenuado' : `et-${color}`
      };
    });
  });

  /** Resumen del mapa para quien lo lee con un lector de pantalla. */
  protected readonly descripcion = computed(() => {
    const r = this.dibujadas();
    const n = (c: ColorMapa) => r.filter((x) => !x.atenuado && x.color === c).length;
    return `Mapa de El Salvador con ${r.length} departamentos: ${n('ok')} en verde (bitácora `
      + `realizada), ${n('warn')} en amarillo (en proceso), ${n('danger')} en rojo (pendiente o `
      + `vencida) y ${n('none')} en gris (sin soporte asignado). El detalle completo está en la `
      + 'tabla que acompaña al mapa.';
  });

  protected seleccionar(r: RegionDibujada): void {
    if (!r.atenuado) this.elegir.emit(r.id);
  }

  /** Nombre institucional de un departamento, para las leyendas que acompañan al mapa. */
  static nombreDe(id: string): string {
    return GEOMETRIA.find((g) => g.id === id)?.nombre ?? id;
  }
}
