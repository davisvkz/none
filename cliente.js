setTimeout(async () => {
  const URL = "https://7b24-2804-2090-8100-ebc8-3b43-61c3-a354-f1a5.ngrok-free.app/resolver";
  const limpar = s => (s ?? "").replace(/\s+/g, " ").trim();
  const letra = s => limpar(s).toUpperCase()
    .match(/^\(?([A-E])\)?[.):\-]?$/)?.[1];

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const escapar = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Objetiva: linhas .alternative-row. Dissertativa: editor Froala (.fr-element).
  const tipoDe = el => el.querySelector(".alternative-row") ? "objetiva"
    : el.querySelector(".fr-element") ? "dissertativa" : null;

  // Extração — copy.js (uma questão defeituosa é pulada, não derruba as outras)
  const extrair = el => {
    const tipo = tipoDe(el);
    const q = {
      numero: Number(el.id.slice(9)),
      disciplina: limpar(el.querySelector("h3 span")?.textContent)
        .replace(/^\|\s*/, ""),
      tipo,
      enunciado: [...el.querySelectorAll(".question_container p")]
        .map(p => limpar(p.textContent))
        .filter(Boolean)
        .join("\n\n"),
      ...(tipo === "objetiva" && {
        alternativas: Object.fromEntries(
          [...el.querySelectorAll(".alternative-row")]
            .map(row => [
              letra(row.querySelector(".col-alternative")?.textContent),
              limpar(row.querySelector("p")?.textContent)
            ])
            .filter(([l, t]) => l && t)
        )
      })
    };

    if (!tipo) throw new Error("tipo da questão não identificado");
    if (!q.enunciado) throw new Error("enunciado vazio");
    if (tipo === "objetiva") {
      const faltam = ["A", "B", "C", "D", "E"].filter(l => !(l in q.alternativas));
      if (faltam.length) throw new Error(`alternativas ausentes: ${faltam}`);
    }
    return q;
  };

  const questoes = [...document.querySelectorAll('[id^="question-"]')]
    .filter(el => /^question-\d+$/.test(el.id))
    .flatMap(el => {
      try { return [extrair(el)]; } catch (e) {
        console.warn(`Questão ${el.id.slice(9)} ignorada: ${e.message}`);
        return [];
      }
    });

  if (!questoes.length) throw new Error("Nenhuma questão válida encontrada.");

  // Envio ao servidor
  const response = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(questoes)
  });

  const respostas = await response.json();
  if (!response.ok) throw new Error(respostas.erro || "Erro no servidor");

  // Marcação — send.js
  const marcar = async (numero, resposta) => {
    const questao = document.getElementById(`question-${numero}`);
    if (!questao) throw new Error("questão não encontrada na página");

    if (tipoDe(questao) === "dissertativa") {
      const editor = questao.querySelector(".fr-element");
      const html = resposta.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
        .map(p => `<p>${escapar(p)}</p>`).join("");
      const igual = () => editor.textContent.replace(/\s/g, "") ===
        resposta.replace(/\s/g, "");

      // insertHTML dispara os eventos nativos que o Froala/framework escutam
      editor.focus();
      document.execCommand("selectAll", false);
      document.execCommand("insertHTML", false, html);
      if (!igual()) {
        editor.innerHTML = html;
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await sleep(300);

      const salvar = [...questao.querySelectorAll("button")]
        .find(b => /salvar resposta/i.test(b.textContent));
      if (!salvar) throw new Error('botão "Salvar resposta" não encontrado');
      salvar.click();
      await sleep(300);
      return;
    }

    const alternativa = [...questao.querySelectorAll(".alternative-row")]
      .find(row =>
        letra(row.querySelector(".col-alternative")?.textContent) === resposta
      );
    if (!alternativa) throw new Error(`alternativa ${resposta} não encontrada`);

    (alternativa.querySelector(".alternative-container") ?? alternativa).click();
  };

  const aplicadas = {};
  for (const [numero, resposta] of Object.entries(respostas)) {
    try {
      await marcar(numero, resposta);
      aplicadas[numero] = resposta;
    } catch (e) {
      console.warn(`Questão ${numero}: ${e.message}`);
    }
  }

  for (const { numero } of questoes)
    if (!(numero in respostas))
      console.warn(`Questão ${numero}: sem resposta do servidor`);

  console.log("Respostas aplicadas:", aplicadas);
}, 5000);
