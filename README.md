# Delícias da Jac – Catálogo digital 2026

Site estático em **HTML, CSS e JavaScript puro** (sem backend, sem build, sem dependências no navegador), pronto para o **GitHub Pages**.
 
Os produtos ficam numa **planilha Excel**; um script converte a planilha em JSON e o site lê esse JSON:

```
data/catalogo.xlsx  →  scripts/xlsx_to_json.py (GitHub Actions)  →  data/produtos.json  →  site
```

## O que o site faz

- 8 categorias, barra de categorias com rolagem horizontal no celular, busca e ordenação por preço.
- Cards com foto, preço, pedido mínimo, descrição e seletores de variação (o preço muda na hora).
- **Adicionar ao carrinho** abre um **pop-up de personalização**: cores (amostras clicáveis + "Outro" com seletor visual), tema (lista + "Outros"), recheios/sabores, quantidade e observações. Cada produto mostra só os campos que fazem sentido para ele.
- Validações: pedido mínimo, limite de cores, limite de sabores por torre, recheio/cor/tema obrigatórios, quantidade em múltiplos de 250 g nos mini suspiros.
- **Cores dourado, prateado e neon** não recebem preço automático: o item vira "preço sob consulta", fica de fora do total e a mensagem avisa que o total é parcial.
- **Carrinho** em painel lateral: contador no cabeçalho, alterar quantidade, editar personalização, remover, esvaziar, total e observações do pedido. Salvo no `localStorage` (continua após atualizar a página). O mesmo produto com personalizações diferentes vira itens separados.
- **Finalizar pedido pelo WhatsApp** (`https://wa.me/5521985075217`): mensagem organizada com produto, variação, quantidade, cores, tema, recheios, preços, subtotais, total estimado e observações. A mensagem não afirma que o pedido está confirmado ou pago.
- Seção "Conheça a Delícias da Jac" (Renata Jacques), informações sobre pedidos, rodapé com Instagram e WhatsApp.

## Estrutura de arquivos

```
index.html                       Estrutura da página
style.css                        Identidade visual (cores em variáveis CSS, no :root)
script.js                        Catálogo, modal de personalização, carrinho, WhatsApp e formulário de encomenda
data/catalogo.xlsx               FONTE OFICIAL dos dados (edite este arquivo)
data/produtos.json               Gerado automaticamente a partir da planilha (não edite à mão)
scripts/xlsx_to_json.py          Conversor + validação
scripts/test_conversor.py        Testes do conversor
scripts/build_apps_script.py     Gera apps-script/DeliciasDaJac.gs (arquivo único) a partir de apps-script/src
apps-script/                     Backend das encomendas (Google Apps Script) e seus testes
docs/ENCOMENDAS.md               Instalação, uso, testes e manutenção do sistema de encomendas
requirements.txt                 Dependência do conversor (openpyxl)
.github/workflows/atualizar-catalogo.yml   Converte a planilha quando ela muda
public/images/produtos/          Fotos dos produtos
public/images/marca/             Logomarca e foto da proprietária
public/images/padrao.svg         Imagem padrão (arquivo de foto inexistente)
```

## Como atualizar a planilha

Abra `data/catalogo.xlsx`. A aba **Leia-me** explica cada coluna. Resumo:

| Aba | Para quê |
|---|---|
| **Produtos** | Um cartão por linha: categoria, nome, descrição, preço (só se não houver variações), pedido mínimo, unidade, imagens, sabores, cores, temas, personalizável, observações, destaque, disponível. |
| **Variações** | Uma linha por variação (tamanho, laço, embalagem…): nome completo, seletores, preço, pedido mínimo, limites de sabores/cores. |
| **Categorias** | As 8 categorias e suas descrições. |
| **Cores** / **Temas** | Listas usadas nos seletores. Cores têm hexadecimal e "sob consulta". "Outro" e "Outros" são automáticos. |
| **Informações gerais** | Nome, WhatsApp (somente números, com 55 + DDD), Instagram, nomes dos arquivos da logomarca e da foto. |
| **Sobre** | Parágrafos da seção "Conheça a Delícias da Jac". |

Formato das listas: itens separados por **ponto e vírgula**. Exemplo: `Brigadeiro; Doce de leite`.

Regras importantes:

- **Preço nunca é estimado.** Preço em branco (sem variações) é recusado pelo conversor.
- **Pedido mínimo em branco = sem mínimo.** O site não inventa mínimos (ex.: brownie de 5 cm).
- **Cores / Temas:** `padrão` usa a lista da aba; ou liste só algumas (`Rosa; Branco`); vazio = o produto não oferece.
- **Máximo de cores:** número ou `livre`. Vazio = 1 cor.
- **Variação "–" em Sabores/Temas (substitui)** = aquela variação não oferece o campo.
- **Disponível = Não:** o produto aparece com o botão desativado.

### Para adicionar um produto novo
1. Aba **Produtos**: nova linha com ID único (letras minúsculas, números e hífen), categoria, nome, descrição.
2. Sem variações: preencha o **Preço**. Com variações: deixe o preço vazio e crie as linhas na aba **Variações** com o mesmo ID.
3. Salve e envie ao GitHub (veja "Publicação").

## Imagens dos produtos

1. Coloque os arquivos em `public/images/produtos/` (JPG, PNG ou WebP).
2. Na aba **Produtos**, coluna **Imagens**, escreva só o nome do arquivo. Para várias fotos, separe com `;`. A primeira é a principal; as demais aparecem como miniaturas no pop-up.
   Exemplo: `brownie-4cm.jpg; brownie-5cm.png`
3. Para trocar uma foto, substitua o arquivo (mesmo nome) ou mude o nome na planilha. Nenhum código muda.

Regras: nomes só com letras, números, ponto, hífen e sublinhado; sem pastas nem endereços (`../`, `http://`…). Nomes inválidos são recusados pelo conversor. Se o arquivo não existir, o site mostra `padrao.svg` com o selo "Foto provisória", e o conversor emite um aviso. Dica: fotos na proporção 4:3, até ~200 KB, carregam rápido no celular.

## Logomarca e fotos da proprietária

- Coloque a logomarca em `public/images/marca/` e informe o nome em **Informações gerais → Logomarca (arquivo)** (padrão: `logo.png`; aceita também `.svg`, `.webp`, `.jpg`).
- Coloque a foto de Renata em `public/images/marca/` e informe o nome em **Foto da proprietária (arquivo)** (padrão: `renata-jacques.jpg`). Foto vertical (4:5) fica melhor.
- Enquanto os arquivos não existem, o cabeçalho mostra o nome em texto e a seção "Conheça a Delícias da Jac" aparece só com o texto. Quando os arquivos forem adicionados, aparecem sozinhos: no cabeçalho, no rodapé (sobre fundo branco, para preservar as cores) e ao lado do texto.

## Como testar

O site lê `data/produtos.json` com `fetch`, então precisa de um servidor (abrir o `index.html` com duplo clique não carrega o catálogo):

```bash
python3 -m http.server 8000      # na pasta do projeto
# abra http://localhost:8000
```

**Conversor e testes** (Python 3.9+):

```bash
pip install -r requirements.txt
python scripts/xlsx_to_json.py          # gera data/produtos.json
python scripts/xlsx_to_json.py --check  # só confere se o JSON está em dia
python scripts/test_conversor.py        # 21 testes (migração, preços, mínimos, imagens, erros)
```

**Roteiro manual rápido**

1. Brownies → 5 cm + com laço: R$ 6,30 e "mínimo não informado"; 4 cm: mínimo 10.
2. Adicionar brownie 4 cm com laço: quantidade 5 é recusada; 20 + Brigadeiro entra no carrinho.
3. Pirulito modelado simples: Rosa + Borboletas + 10 → R$ 60,00. Total do carrinho: R$ 166,00.
4. Macaron individual: duas cores exigem 40 (20 por cor). Dourado mostra "Sob consulta".
5. Torre de macarons 4 andares: só 2 sabores. Torre de suspiros 30 cm: só 2 cores.
6. Mini suspiros: mínimo 500 g; 600 g é recusado.
7. Atualize a página: o carrinho continua. Clique em **Finalizar pedido pelo WhatsApp**.

## Sistema de encomendas (Fase 1)

O carrinho tem o botão **Finalizar encomenda** (formulário → planilha Google privada via Apps Script). Ele só aparece quando o campo "Sistema de encomendas (URL do Apps Script)" do Excel está preenchido; vazio, o site mantém o botão antigo de WhatsApp. Instalação, uso e testes: **[docs/ENCOMENDAS.md](docs/ENCOMENDAS.md)**.

```bash
node --test apps-script/test/backend.test.js    # 32 testes do backend (simulados)
python scripts/build_apps_script.py --check     # confere se o arquivo único está em dia
```

## Publicação no GitHub Pages

1. Crie um repositório e envie **todos** os arquivos (inclusive a pasta oculta `.github`):
   ```bash
   git init && git add . && git commit -m "Catálogo Delícias da Jac"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   git push -u origin main
   ```
2. **Settings → Pages → Build and deployment → Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. **Settings → Actions → General → Workflow permissions**: marque **Read and write permissions** (para o workflow gravar o JSON).
4. O site fica em `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`. Todos os caminhos são relativos, então funciona dentro de subpastas.

### Rotina de atualização

1. Edite `data/catalogo.xlsx` (e adicione imagens em `public/images/produtos/`, se for o caso).
2. Envie ao GitHub: `git add . && git commit -m "Atualiza catálogo" && git push`, ou, pelo site do GitHub, **Add file → Upload files** (mantenha o nome e a pasta `data/`).
3. O workflow **Atualizar catálogo** (aba **Actions**) lê a planilha, valida e grava `data/produtos.json`.
   - Se a planilha tiver erro, o workflow falha (✗ vermelho) e a mensagem diz a aba, a linha e o problema. O catálogo publicado não muda.
   - Se não houver mudança nos dados, nada é gravado.
4. Em alguns minutos o GitHub Pages publica a versão nova. Se o catálogo não atualizar, confira a aba Actions e use **Ctrl+F5** para limpar o cache.

**Sem loops:** o workflow só dispara quando `data/catalogo.xlsx` (ou o script) muda. O arquivo que ele grava, `data/produtos.json`, não está nessa lista, o commit usa `[skip ci]`, e o JSON gerado é determinístico (sem data/hora), então não há commits repetidos. Se alguém editar o JSON à mão, a próxima alteração na planilha o sobrescreve.

## Decisões a conferir na planilha

Estas regras vieram do catálogo; onde o catálogo não diz nada, a escolha foi conservadora e pode ser mudada na planilha sem mexer no código:

- **Cores:** 1 cor por padrão. Macaron individual, caixinha de macarons, torres de macarons e torre de suspiros de 40 cm aceitam mais de uma cor (`livre`); a torre de 30 cm aceita até 2 (catálogo). Macaron individual: mínimo de 20 **por cor** ("mínimo 20 da mesma cor").
- **Sabores das torres de macarons:** 4 andares = até 2; 5 e 6 andares = até 3 (catálogo). 7, 8 e 10 andares: sem limite informado, então sem limite no site.
- **Quais produtos têm cor/tema:** cor nos produtos de suspiro, macaron, lembrancinhas e torres; tema nos pirulitos modelados/premium, bonequinha, suspiros modelados/3D, adicional temático e centros de mesa modelado/premium. Brownies, bem-casados e mini suspiros não oferecem cor nem tema.
- **Temas:** a lista é sugestão de interface, não garantia de disponibilidade. "Outros" avisa que depende de confirmação.
- **Mini suspiros:** vendidos em pacotes de 250 g; o cliente informa o total em gramas (múltiplos de 250, mínimo 500 g).
- O catálogo trata como cores sob consulta: **neon, dourado e prateado**. Dourado e prateado são amostras marcadas "sob consulta"; "neon" é detectado quando digitado em "Outro".
- 
