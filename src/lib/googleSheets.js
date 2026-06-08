export function syncStatusLabel(status) {
  const labels = {
    local: "Local",
    dirty: "Alterações locais",
    syncing: "Sincronizando",
    pulling: "Puxando dados",
    synced: "Sincronizado",
    error: "Configuração pendente",
  };
  return labels[status] ?? "Local";
}

const tableMap = {
  reservas: "reservas",
  receitas_extras: "receitasExtras",
  despesas: "despesas",
  consumo_hospedes: "consumos",
  cotacoes: "cotacoes",
  pagamentos: "pagamentos",
  tarefas: "tarefas",
  mov_cavalos: "movCavalos",
  horses: "horses",
  riding_activities: "ridingActivities",
  riding_reservations: "ridingReservations",
  horse_health_records: "horseHealthRecords",
  ingredients: "ingredients",
  menu_products: "menuProducts",
  recipe_items: "recipeItems",
  stock_movements: "stockMovements",
  suppliers: "suppliers",
  purchase_invoices: "purchaseInvoices",
  purchase_invoice_items: "purchaseInvoiceItems",
  supplier_product_mappings: "supplierProductMappings",
  accounts_payable: "accountsPayable",
  accounts_receivable: "accountsReceivable",
  guest_profiles: "guestProfiles",
  users: "users",
  roles: "roles",
  role_permissions: "rolePermissions",
  audit_logs: "auditLogs",
  repasses_mt: "repasses",
  tarifas_base: "tarifasBase",
  ajuste_unidades: "ajusteUnidades",
  otas: "otas",
  produtos: "cardapio",
  estoque: "estoque",
};

export async function pushToGoogleSheets(data) {
  const url = import.meta.env.VITE_GOOGLE_SHEETS_WEB_APP_URL;
  const secret = import.meta.env.VITE_GOOGLE_SYNC_SECRET;

  if (!url || !secret) {
    throw new Error("Configure VITE_GOOGLE_SHEETS_WEB_APP_URL e VITE_GOOGLE_SYNC_SECRET.");
  }

  const response = await fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret, tables: toSheetsPayload(data) }),
  });

  return response;
}

export async function pullFromGoogleSheets() {
  const url = import.meta.env.VITE_GOOGLE_SHEETS_WEB_APP_URL;
  const secret = import.meta.env.VITE_GOOGLE_SYNC_SECRET;

  if (!url || !secret) {
    throw new Error("Configure VITE_GOOGLE_SHEETS_WEB_APP_URL e VITE_GOOGLE_SYNC_SECRET.");
  }

  const payload = await jsonp(url, { secret });
  if (payload.ok === false) {
    throw new Error(payload.error || "Acesso negado pelo Apps Script.");
  }
  return fromSheetsPayload(payload.tables ?? {});
}

function toSheetsPayload(data) {
  return {
    reservas: data.reservas,
    receitas_extras: data.receitasExtras,
    despesas: data.despesas,
    consumo_hospedes: data.consumos,
    cotacoes: data.cotacoes ?? [],
    pagamentos: data.pagamentos ?? [],
    tarefas: data.tarefas ?? [],
    mov_cavalos: data.movCavalos,
    horses: data.horses ?? [],
    riding_activities: data.ridingActivities ?? [],
    riding_reservations: data.ridingReservations ?? [],
    horse_health_records: data.horseHealthRecords ?? [],
    ingredients: data.ingredients ?? [],
    menu_products: data.menuProducts ?? [],
    recipe_items: data.recipeItems ?? [],
    stock_movements: data.stockMovements ?? [],
    suppliers: data.suppliers ?? [],
    purchase_invoices: data.purchaseInvoices ?? [],
    purchase_invoice_items: data.purchaseInvoiceItems ?? [],
    supplier_product_mappings: data.supplierProductMappings ?? [],
    accounts_payable: data.accountsPayable ?? [],
    accounts_receivable: data.accountsReceivable ?? [],
    guest_profiles: data.guestProfiles ?? [],
    users: data.users ?? [],
    roles: data.roles ?? [],
    role_permissions: data.rolePermissions ?? [],
    audit_logs: data.auditLogs ?? [],
    repasses_mt: data.repasses,
    tarifas_base: data.tarifasBase,
    ajuste_unidades: data.ajusteUnidades,
    otas: data.otas,
    listas_config: flattenLists(data.listas),
    produtos: data.cardapio,
    estoque: data.estoque,
  };
}

function flattenLists(lists = {}) {
  return Object.entries(lists).flatMap(([lista, valores]) =>
    (valores ?? []).map((valor) => ({ lista, valor })),
  );
}

function unflattenLists(rows = []) {
  return rows.reduce((acc, row) => {
    if (!row.lista || row.valor === undefined || row.valor === "") return acc;
    acc[row.lista] ??= [];
    acc[row.lista].push(row.valor);
    return acc;
  }, {});
}

function fromSheetsPayload(tables) {
  const next = {};
  Object.entries(tableMap).forEach(([sheetName, appName]) => {
    next[appName] = tables[sheetName] ?? [];
  });
  if (tables.listas_config) {
    next.listas = unflattenLists(tables.listas_config);
  }
  return next;
}

function jsonp(baseUrl, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `__ranchoSheets_${Date.now()}_${Math.round(Math.random() * 100000)}`;
    const script = document.createElement("script");
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("callback", callbackName);

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Não foi possível puxar dados do Google Sheets."));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}
