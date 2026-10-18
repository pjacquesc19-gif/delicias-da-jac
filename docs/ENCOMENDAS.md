# Sistema de encomendas – Delícias da Jac (Fase 1)

O cliente monta o carrinho, preenche o formulário **Finalizar encomenda** e o pedido é gravado numa planilha Google **privada** por um Google Apps Script. A confeitaria analisa, aprova a data, envia o PIX e confirma. Nada é confirmado automaticamente.

## 1. Arquitetura e limites (leia antes de instalar)

```
Site (GitHub Pages)  --POST JSON (text/plain)-->  Apps Script (web app)  -->  Planilha privada + Agenda privada + e-mails
        ^                                                                  (executa como a conta da proprietária)
        +---------------- resposta JSON {ok, orderId} lida pelo site ------+
```

- **Endereço público, mas só recebe pedidos.** A web app é "Executar como: eu / Acesso: qualquer pessoa". A única ação pública é `criarPedido`; `doGet` só diz que o serviço está no ar. Não há consulta, listagem nem mudança de status pelo endereço público.
- **Sem `no-cors`.** O site envia `Content-Type: text/plain` (requisição "simples", sem preflight) e **lê a resposta**. "Pedido recebido" só aparece se vier `{ok:true, orderId:"DJ-0001"}`. Qualquer outra coisa (queda de rede, HTML, resposta ilegível) vira "não conseguimos confirmar"; reenviar é seguro (idempotência por `requestId` e por impressão digital do pedido).
- **Limitação conhecida:** o Apps Script responde com um redirecionamento (302) para `googleusercontent.com`. Esse padrão (`text/plain` + `redirect: follow`) é amplamente usado e deve permitir a leitura, **mas não pôde ser testado com o Google real neste ambiente**. Se, no teste real, o pedido aparecer na planilha e o site disser "não conseguimos confirmar", é esse ponto (ver §7).
- **Preços conferidos no servidor:** o script baixa o `produtos.json` publicado (`CATALOG_URL`) e recalcula tudo. Se o total do cliente divergir, devolve `PRECO_ALTERADO` e o site recarrega o catálogo.
- **Cotas:** contas Gmail comuns enviam ~100 e-mails/dia e o script limita os pedidos (5/h por e-mail e por WhatsApp, 30/min e 300/dia no total). Erro de envio de e-mail **nunca** impede a gravação do pedido; fica no Histórico.
- **A data pedida não bloqueia nada:** vários pedidos podem pedir o mesmo dia; a análise é manual.

## 2. Instalação passo a passo

1. Crie uma **planilha Google nova** (ex.: "Delícias da Jac – Encomendas"). Ela fica privada ("Restrito").
2. Nela: **Extensões → Apps Script**. Apague o código de exemplo.
3. Cole o conteúdo de `apps-script/DeliciasDaJac.gs` (arquivo único gerado). Em **Configurações do projeto** marque "Mostrar o arquivo appsscript.json" e substitua pelo conteúdo de `apps-script/appsscript.json`.
4. A função `definirConfiguracao` (final do arquivo) tem os valores entre aspas. **Preencha no editor do Apps Script, rode uma vez e apague os valores do código (nunca no GitHub):**
   - `OWNER_EMAIL`: e-mail que recebe os avisos de novo pedido;
   - `CATALOG_URL`: `https://USUARIO.github.io/REPOSITORIO/data/produtos.json`;
   - `PIX_MODE`: `WHATSAPP` (padrão: o e-mail diz que os dados vão por WhatsApp) ou `EMAIL` (a chave vai no e-mail; exige `PIX_KEY`, e `PIX_HOLDER` é opcional);
   - `ADMIN_EMAILS` (opcional): quem pode aprovar/confirmar; vazio = só `OWNER_EMAIL`;
   - `CALENDAR_ID` (opcional): vazio = o script cria/usa a agenda privada **"Delícias da Jac - Encomendas"**;
   - `MODE_TEST`: deixe `true` até a entrada em produção.
5. Execute, nesta ordem: `definirConfiguracao` → `verificarConfiguracao` (deve listar o que falta) → `inicializarPlanilha` → `instalarGatilhos`. Na primeira execução o Google pede autorização (planilhas, e-mail, agenda, requisições externas, gatilhos). Em "app não verificado" use **Avançado → Acessar (não seguro)**: é o seu próprio script.
6. **Implantar → Nova implantação → App da Web**: Executar como **Eu**; Quem tem acesso **Qualquer pessoa**. Copie a URL que termina em `/exec`.
7. Em `data/catalogo.xlsx`, aba de configurações, campo **"Sistema de encomendas (URL do Apps Script)"**: cole a URL. Faça commit; a Action converte o Excel e o site passa a mostrar "Finalizar encomenda". **Enquanto o campo estiver vazio, o site continua usando o botão antigo de WhatsApp.**
8. Para atualizar o script depois: Implantar → **Gerenciar implantações → editar → Nova versão**. Assim a URL `/exec` não muda.

A URL do endpoint não é segredo (qualquer visitante a vê), mas ela só aceita pedidos. A chave PIX e e-mails ficam apenas nas Propriedades do Script.

## 3. Como a proprietária trabalha na planilha

Abas: **Pedidos**, **Itens do pedido**, **Histórico** (nunca apague) e **Como usar**.

1. Chegou pedido → você recebe e-mail com o link da planilha. Status: *Aguardando análise*.
2. Aceitou a data/horário: mude o status para **Aguardando sinal**. **Isso não envia nada.** Marque **Autorizar notificação**: o script valida, envia o e-mail de aprovação (diz que **ainda não está confirmado**, com total, sinal, saldo e instruções de PIX), registra no Histórico e desmarca a caixa.
3. Recebeu o PIX e conferiu: marque **Sinal recebido** e mude para **Confirmado** + **Autorizar notificação**. O script envia o e-mail definitivo, grava a data de confirmação e cria o evento na agenda privada. Sem "Sinal recebido" marcado **nada é confirmado**.
4. Demais status: *Em produção*, *Concluído*, *Cancelado* (remove o evento da agenda).
5. Mudou data/horário depois: o mesmo evento da agenda é atualizado. Mudou o total: sinal/saldo e o link recalculam.
6. A coluna **Link WhatsApp** abre uma mensagem pronta por status. O envio é sempre manual.
7. Cada e-mail só sai uma vez (colunas de controle). Para reenviar, desmarque a coluna "enviado" e autorize de novo.

## 4. Teste antes de publicar (MODE_TEST = true)

Com o modo teste, **e-mails a clientes nunca são enviados** (ficam simulados no Histórico); o aviso à proprietária é real.

1. `testeManualPedidoFicticio`: grava um pedido fictício. Confira a linha, os itens, o Histórico e o e-mail à proprietária.
2. Pelo site publicado, faça um pedido com um e-mail seu e confirme "Pedido recebido" + o ID igual ao da planilha.
3. Teste: dados incompletos; abaixo do mínimo; domingo/data passada; clicar duas vezes (um só pedido); aprovação sem autorização (nada acontece); aprovação com autorização; confirmação sem "Sinal recebido" (recusada) e com ele; criar e mover o evento da agenda; editar a planilha com uma conta não autorizada (a alteração é revertida e o Histórico mostra "Operação administrativa NEGADA").
4. Entrada em produção: `desligarModoTeste`. Só então os clientes recebem e-mails. **Não faça testes com e-mail de clientes reais sem autorização.**

Testes locais (sem Google): `node --test apps-script/test/backend.test.js` (32 testes com simulações) e `PORT=8766 node apps-script/test/dev-server.js` para simular a web app (modos ok/html/down/drop/slow/lostreply/nocors).

## 5. Manutenção e recuperação

- **Nada aparece na planilha:** confira a URL no Excel, a implantação ("Qualquer pessoa") e `verificarConfiguracao`.
- **Pedido gravado, mas o site diz "não conseguimos confirmar":** o cliente pode reenviar (não duplica); confira também o §7.
- **E-mail falhou:** veja o Histórico (erro registrado). Desmarque a coluna "enviado" e marque "Autorizar notificação" de novo.
- **Cota diária de e-mails estourou:** envie pelo link de WhatsApp e retome no dia seguinte.
- **Gatilho sumiu:** rode `instalarGatilhos` (não duplica).
- **Erros de linhas/colunas:** não mova nem renomeie colunas; colunas U/V ocultas guardam o controle de duplicidade.
- **Perdeu a planilha:** copie a planilha (Arquivo → Fazer uma cópia) periodicamente e reinstale o script na cópia.
- **Calendário duplicado:** o script busca pelo número do pedido antes de criar; apague o excedente manualmente.

## 6. Futura página administrativa (não construída)

O código já separa a camada pública (`doGet/doPost`) da camada de serviço (`svc*_`), que a planilha usa hoje. Uma página administrativa futura deve ser **outra web app**, com login Google verificado no servidor (e-mail da sessão contra `ADMIN_EMAILS`), chamando essas funções de serviço. Não exponha ações administrativas pelo endpoint público.

## 7. Se a resposta não for lida pelo site

Sintoma: o pedido está na planilha, o site mostra erro. Verifique no navegador (F12 → Rede) se a resposta final do `/exec` traz `Access-Control-Allow-Origin`. Se não trouxer, a alternativa segura é hospedar um pequeno proxy (Cloudflare Worker, por exemplo) que repasse o POST ao Apps Script e devolva a resposta com CORS, mantendo a regra de só mostrar sucesso com ID verificável. Não use `no-cors` como solução.

## 8. Privacidade

Agenda privada e sem contatos do cliente nos eventos; nenhum dado pessoal vai a serviços externos; nenhum segredo está no repositório.
