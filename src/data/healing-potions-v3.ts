/** Accepted late healing tiers. Stable IDs; ordinary 37/70 HP bottles stay intact. */
export const LATE_HEALING_POTIONS = {
  v3_potion_concentrate: {name:'Багровый концентрат',type:'consumable',icon:'♥',requiredLevel:25,heal:220,buyPrice:330,value:330,desc:'Мгновенно восстанавливает 220 HP. Требуется уровень 25.'},
  v3_potion_elixir: {name:'Багровый эликсир',type:'consumable',icon:'♥',requiredLevel:50,heal:600,buyPrice:900,value:900,desc:'Мгновенно восстанавливает 600 HP. Требуется уровень 50.'},
  v3_potion_supreme: {name:'Высший багровый эликсир',type:'consumable',icon:'♥',requiredLevel:75,heal:1400,buyPrice:2100,value:2100,desc:'Мгновенно восстанавливает 1400 HP. Требуется уровень 75.'},
} as const;
