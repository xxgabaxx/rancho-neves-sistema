const TABLES = [
  "reservas",
  "receitas_extras",
  "despesas",
  "consumo_hospedes",
  "cotacoes",
  "pagamentos",
  "tarefas",
  "mov_cavalos",
  "horses",
  "riding_activities",
  "riding_reservations",
  "horse_health_records",
  "ingredients",
  "menu_products",
  "recipe_items",
  "stock_movements",
  "suppliers",
  "purchase_invoices",
  "purchase_invoice_items",
  "supplier_product_mappings",
  "accounts_payable",
  "accounts_receivable",
  "guest_profiles",
  "users",
  "roles",
  "role_permissions",
  "audit_logs",
  "repasses_mt",
  "tarifas_base",
  "ajuste_unidades",
  "otas",
  "listas_config",
  "produtos",
  "estoque",
];

const SCRIPT_SECRET = "NxccTf1kP-yua24r8AYNurbuCBrpWhRRyg9VLISObOA";

function doGet(e) {
  const params = (e && e.parameter) || {};
  const callback = params.callback || "callback";
  if (!isAuthorized_(params.secret)) {
    return jsonp_(callback, { ok: false, error: "Acesso negado." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tables = {};
  TABLES.forEach(function (name) {
    tables[name] = readTable_(ss, name);
  });
  return jsonp_(callback, { ok: true, tables: tables });
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  if (!isAuthorized_(payload.secret)) {
    return json_({ ok: false, error: "Acesso negado." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.entries(payload.tables || {}).forEach(function ([name, rows]) {
    writeTable_(ss, name, rows || []);
  });
  return json_({ ok: true });
}

function isAuthorized_(secret) {
  return Boolean(SCRIPT_SECRET) && secret === SCRIPT_SECRET;
}

function jsonp_(callback, payload) {
  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(payload) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function readTable_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(String);
  return values
    .filter(function (row) {
      return row.some(function (cell) {
        return cell !== "";
      });
    })
    .map(function (row) {
      const item = {};
      headers.forEach(function (header, index) {
        item[header] = row[index];
      });
      return item;
    });
}

function writeTable_(ss, name, rows) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clearContents();
  if (!rows.length) return;
  const headers = [...new Set(rows.flatMap(function (row) {
    return Object.keys(row);
  }))];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, rows.length, headers.length)
    .setValues(rows.map(function (row) {
      return headers.map(function (header) {
        return row[header] == null ? "" : row[header];
      });
    }));
  sheet.setFrozenRows(1);
}
