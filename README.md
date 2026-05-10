# Sistema Rancho das Neves

Sistema web inicial para substituir a planilha `Controle Total - Rancho das Neves .xlsx`.

## Rodar local

```bash
npm install
npm run dev
```

## Banco no Google Drive

A tela **Google Drive** envia e puxa dados de uma Google Sheet via Apps Script. Para ativar:

1. Crie uma planilha Google no Drive.
2. Abra **Extensões > Apps Script**.
3. Cole o conteúdo de `google-apps-script.js`.
4. Publique como **Web App**.
5. Configure o acesso como **qualquer pessoa com o link**.
6. Crie um arquivo `.env` com:

```env
VITE_GOOGLE_SHEETS_WEB_APP_URL=URL_DO_WEB_APP
VITE_GOOGLE_SHEET_URL=URL_DA_PLANILHA
VITE_APP_ACCESS_USER=USUARIO
VITE_APP_ACCESS_PIN=PIN_DE_ACESSO
VITE_GOOGLE_SYNC_SECRET=SEGREDO_IGUAL_AO_SCRIPT
```

Depois rode `npm run dev` novamente.

## Segurança

- O sistema exige usuário e PIN antes de abrir as telas operacionais.
- O botão **Bloquear sistema** encerra a sessão do navegador.
- Ações destrutivas pedem confirmação e PIN.
- O Apps Script valida `VITE_GOOGLE_SYNC_SECRET`; sempre publique uma nova versão do Web App depois de trocar `google-apps-script.js`.

Abas sugeridas na planilha Google:

- `reservas`
- `cotacoes`
- `pagamentos`
- `tarefas`
- `receitas_extras`
- `despesas`
- `consumo_hospedes`
- `produtos`
- `estoque`
- `mov_cavalos`
- `repasses_mt`
- `tarifas_base`
- `ajuste_unidades`
- `otas`
- `cabanas`
- `listas_config`
