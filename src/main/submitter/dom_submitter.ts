import type { Page } from 'playwright';
import type { VagaAnalisada } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { generateFormAnswers, correctFormErrors } from './agent';
import { getSubmitterConfig, getSubmitterPrefillProfile } from './service';

const OUTPUT_DIR = path.resolve(process.cwd(), 'output');
const ANALISE_JSON_PATH = path.join(OUTPUT_DIR, 'analise-vagas.json');
const VAGAS_SUBMETIDAS_PATH = path.join(OUTPUT_DIR, 'vagas-submetidas.json');

function compararVagas(vaga1: VagaAnalisada, vaga2: VagaAnalisada): boolean {
  if (vaga1.id && vaga2.id) {
    return vaga1.id === vaga2.id;
  }
  if (vaga1.linkVaga && vaga2.linkVaga) {
    return vaga1.linkVaga === vaga2.linkVaga;
  }
  return false;
}

async function fluxoModalSubmissao(page: Page, vaga: VagaAnalisada, cv: string): Promise<boolean> {
  const botaoClicado = await clicarBotaoCandidaturaSimplificada(page);
  if (!botaoClicado) {
    return false;
  }

  await page.waitForTimeout(1000);

  const modal = await page.$('div[data-test-modal][role="dialog"]').catch(() => null);
  if (!modal) {
    console.log('⚠️ Modal não encontrado');
    return false;
  }

  await page.waitForTimeout(500);

  const botaoContinuarCandidatura = await verificarBotaoContinuarCandidatura(page);
  if (botaoContinuarCandidatura) {
    console.log('✅ Botão "Continuar candidatura" encontrado. Clicando...');
    const clicado = await clicarBotaoContinuarCandidatura(page);
    if (clicado) {
      console.log('✅ Botão "Continuar candidatura" clicado com sucesso.');
    } else {
      console.log('⚠️ Não foi possível clicar no botão "Continuar candidatura".');
    }
  }

  await page.waitForTimeout(1000);

  const botaoEnviarJaVisivel = await verificarBotaoEnviarJaVisivel(page);
  if (botaoEnviarJaVisivel) {
    console.log('✅ Botão "Enviar candidatura" já está visível. Enviando diretamente...');
    const enviado = await clicarBotaoEnviar(page);
    if (enviado) {
      await page.waitForTimeout(3000);
      const submissaoConcluida = await verificarSubmissaoConcluida(page);
      if (submissaoConcluida) {
        salvarVagaSubmetida(vaga);
        return true;
      } else {
        console.log('⚠️ Submissão pode não ter sido concluída. Verificando novamente...');
        await page.waitForTimeout(2000);
        const submissaoConcluidaNovamente = await verificarSubmissaoConcluida(page);
        if (submissaoConcluidaNovamente) {
          salvarVagaSubmetida(vaga);
          return true;
        } else {
          console.log('❌ Submissão não foi concluída com sucesso.');
          return false;
        }
      }
    } else {
      console.log('⚠️ Não foi possível clicar no botão "Enviar candidatura". Continuando com fluxo normal...');
    }
  }

  let tentativas = 0;
  const maxTentativas = 20;

  while (tentativas < maxTentativas) {
    tentativas++;
    console.log(`\n📋 Verificando formulário (tentativa ${tentativas}/${maxTentativas})...`);

    const cvJaAnexado = await verificarCVJaAnexado(page);
    if (cvJaAnexado) {
      console.log('📎 CV já está anexado. Pulando etapa de anexo de CV...');
      await page.waitForTimeout(500);
      
      const botaoAvancarExiste = await verificarBotaoAvancar(page);
      if (botaoAvancarExiste) {
        console.log('✅ Avançando para próximo passo (CV já anexado)...');
        await clicarBotaoAvancar(page);
        await page.waitForTimeout(1500);
        continue;
      } else {
        console.log('⚠️ CV anexado mas botão de avançar não encontrado. Continuando com fluxo normal...');
      }
    }

    const formularioJSON = await capturarFormulario(page);
    if (!formularioJSON) {
      console.log('⚠️ Nenhum formulário encontrado. Verificando se há botão de revisar...');
      
      const botaoRevisar = await verificarBotaoRevisar(page);
      if (botaoRevisar) {
        console.log('✅ Botão "Revisar" encontrado. Verificando erros antes de finalizar...');
        await clicarBotaoRevisar(page);
        await page.waitForTimeout(2000);
        
        let camposComErro = await detectarErrosFormulario(page);
        let tentativasCorrecao = 0;
        const maxTentativasCorrecao = 3;
        
        while (camposComErro.length > 0 && tentativasCorrecao < maxTentativasCorrecao) {
          tentativasCorrecao++;
          console.log(`⚠️ ${camposComErro.length} campo(s) com erro detectado(s). Corrigindo (tentativa ${tentativasCorrecao}/${maxTentativasCorrecao})...`);
          await _corrigirErrosFormulario(page, camposComErro, cv, vaga);
          await page.waitForTimeout(2000);
          
          if (tentativasCorrecao < maxTentativasCorrecao) {
            const botaoRevisarNovamente = await verificarBotaoRevisar(page);
            if (botaoRevisarNovamente) {
              console.log('🔄 Clicando em "Revisar" novamente para verificar se os erros foram corrigidos...');
              await clicarBotaoRevisar(page);
              await page.waitForTimeout(2000);
            }
          }
          
          camposComErro = await detectarErrosFormulario(page);
          if (camposComErro.length > 0) {
            console.log(`⚠️ Ainda há ${camposComErro.length} campo(s) com erro após correção.`);
          } else {
            console.log('✅ Todos os erros foram corrigidos!');
            break;
          }
        }
        
        if (camposComErro.length > 0) {
          console.log(`❌ Não foi possível corrigir todos os erros após ${maxTentativasCorrecao} tentativas. Erros restantes: ${camposComErro.map(e => `${e.campoId} (${e.mensagem})`).join(', ')}`);
          console.log('⚠️ Submissão não será concluída devido a erros no formulário.');
          return false;
        }
        
        const botaoEnviarExiste = await page.$('button[data-live-test-easy-apply-submit-button], button[aria-label="Enviar candidatura"], button[aria-label*="Enviar"]').catch(() => null);
        if (!botaoEnviarExiste) {
          const botaoRevisarAindaExiste = await verificarBotaoRevisar(page);
          if (botaoRevisarAindaExiste) {
            console.log('🔄 Clicando em "Revisar" uma última vez para garantir que o botão "Enviar" apareça...');
            await clicarBotaoRevisar(page);
            await page.waitForTimeout(2000);
          }
        }
        
        console.log('✅ Nenhum erro detectado. Finalizando submissão...');
        const enviado = await clicarBotaoEnviar(page);
        if (!enviado) {
          console.log('⚠️ Não foi possível clicar no botão "Enviar". Tentando novamente...');
          await page.waitForTimeout(2000);
          const enviadoNovamente = await clicarBotaoEnviar(page);
          if (!enviadoNovamente) {
            console.log('❌ Não foi possível clicar no botão "Enviar" após múltiplas tentativas.');
            return false;
          }
        }
        
        await page.waitForTimeout(3000);
        
        const submissaoConcluida = await verificarSubmissaoConcluida(page);
        if (submissaoConcluida) {
          salvarVagaSubmetida(vaga);
          return true;
        } else {
          console.log('⚠️ Submissão pode não ter sido concluída. Verificando novamente...');
          await page.waitForTimeout(2000);
          const submissaoConcluidaNovamente = await verificarSubmissaoConcluida(page);
          if (submissaoConcluidaNovamente) {
            salvarVagaSubmetida(vaga);
            return true;
          } else {
            console.log('❌ Submissão não foi concluída com sucesso.');
            return false;
          }
        }
      }

      const botaoAvancarExiste = await verificarBotaoAvancar(page);
      if (botaoAvancarExiste) {
        console.log('📤 Avançando para próximo passo...');
        await clicarBotaoAvancar(page);
        await page.waitForTimeout(1500);
        continue;
      } else {
        console.log('⚠️ Nenhum botão de avançar ou revisar encontrado. Finalizando...');
        break;
      }
    }

    const camposJSON = JSON.parse(formularioJSON);
    const camposVazios = camposJSON.filter((campo: any) => {
      if (campo.tipo === 'radio-group') {
        return !campo.checked;
      }
      if (campo.tipoInput === 'checkbox') {
        return !campo.checked;
      }
      if (campo.tipoInput === 'radio' && campo.tipo !== 'radio-group') {
        return !campo.checked;
      }
      if (campo.tipo === 'select') {
        const valorAtual = campo.valorAtual || '';
        const valoresPlaceholder = [
          'select an option',
          'selecione uma opção',
          'selecione',
          'escolha uma opção',
          'choose an option',
          'seleccione una opción',
          ''
        ];
        return valoresPlaceholder.includes(valorAtual.toLowerCase().trim()) || valorAtual.trim() === '';
      }
      return !campo.valorAtual || campo.valorAtual.trim() === '';
    });

    if (camposVazios.length === 0) {
      console.log('ℹ️ Todos os campos já estão preenchidos. Avançando...');
      const botaoAvancarExiste = await verificarBotaoAvancar(page);
      if (botaoAvancarExiste) {
        await clicarBotaoAvancar(page);
        await page.waitForTimeout(1500);
        continue;
      }
      
      const botaoRevisar = await verificarBotaoRevisar(page);
      if (botaoRevisar) {
        console.log('✅ Botão "Revisar" encontrado. Verificando erros antes de finalizar...');
        await clicarBotaoRevisar(page);
        await page.waitForTimeout(2000);
        
        const camposComErro = await detectarErrosFormulario(page);
        if (camposComErro.length > 0) {
          console.log(`⚠️ ${camposComErro.length} campo(s) com erro detectado(s). Corrigindo...`);
          await _corrigirErrosFormulario(page, camposComErro, cv, vaga);
          await page.waitForTimeout(1500);
          
          const camposComErroAposCorrecao = await detectarErrosFormulario(page);
          if (camposComErroAposCorrecao.length > 0) {
            console.log(`⚠️ Ainda há ${camposComErroAposCorrecao.length} campo(s) com erro após correção. Tentando novamente...`);
            await _corrigirErrosFormulario(page, camposComErroAposCorrecao, cv, vaga);
            await page.waitForTimeout(1500);
          }
        }
        
        await clicarBotaoEnviar(page);
        await page.waitForTimeout(2000);
        salvarVagaSubmetida(vaga);
        return true;
      }
      continue;
    }

    console.log(`📝 ${camposVazios.length} campo(s) vazio(s) encontrado(s) de ${camposJSON.length} total. Enviando para IA...`);

    const formularioVazioJSON = JSON.stringify(camposVazios, null, 2);
    const config = getSubmitterConfig();
    const profile = getSubmitterPrefillProfile();
    const respostas = await generateFormAnswers(config.geminiApiKey || "", cv, profile, vaga, formularioVazioJSON);
    if (!respostas) {
      console.log('⚠️ Não foi possível gerar respostas. Tentando avançar...');
      const botaoAvancarExiste = await verificarBotaoAvancar(page);
      if (botaoAvancarExiste) {
        await clicarBotaoAvancar(page);
        await page.waitForTimeout(1500);
        continue;
      } else {
        break;
      }
    }

    const camposPreenchidos = await preencherFormulario(page, respostas);
    console.log(`✅ ${camposPreenchidos} campo(s) preenchido(s) neste formulário`);

    await page.waitForTimeout(1000);

    const botaoRevisar = await verificarBotaoRevisar(page);
    if (botaoRevisar) {
      console.log('✅ Botão "Revisar" encontrado. Verificando erros antes de finalizar...');
      await clicarBotaoRevisar(page);
      await page.waitForTimeout(2000);
      
      let camposComErro = await detectarErrosFormulario(page);
      let tentativasCorrecao = 0;
      const maxTentativasCorrecao = 3;
      
      while (camposComErro.length > 0 && tentativasCorrecao < maxTentativasCorrecao) {
        tentativasCorrecao++;
        console.log(`⚠️ ${camposComErro.length} campo(s) com erro detectado(s). Corrigindo (tentativa ${tentativasCorrecao}/${maxTentativasCorrecao})...`);
        await corrigirErrosFormulario(page, camposComErro, cv);
        await page.waitForTimeout(2000);
        
        camposComErro = await detectarErrosFormulario(page);
        if (camposComErro.length > 0) {
          console.log(`⚠️ Ainda há ${camposComErro.length} campo(s) com erro após correção.`);
        }
      }
      
      if (camposComErro.length > 0) {
        console.log(`❌ Não foi possível corrigir todos os erros após ${maxTentativasCorrecao} tentativas. Erros restantes: ${camposComErro.map(e => `${e.campoId} (${e.mensagem})`).join(', ')}`);
        console.log('⚠️ Submissão não será concluída devido a erros no formulário.');
        return false;
      }
      
      console.log('✅ Nenhum erro detectado. Finalizando submissão...');
      await clicarBotaoEnviar(page);
      await page.waitForTimeout(3000);
      
      const submissaoConcluida = await verificarSubmissaoConcluida(page);
      if (submissaoConcluida) {
        salvarVagaSubmetida(vaga);
        return true;
      } else {
        console.log('⚠️ Submissão pode não ter sido concluída. Verificando novamente...');
        await page.waitForTimeout(2000);
        const submissaoConcluidaNovamente = await verificarSubmissaoConcluida(page);
        if (submissaoConcluidaNovamente) {
          salvarVagaSubmetida(vaga);
          return true;
        } else {
          console.log('❌ Submissão não foi concluída com sucesso.');
          return false;
        }
      }
    }

    const botaoAvancarExiste = await verificarBotaoAvancar(page);
    if (botaoAvancarExiste) {
      console.log('📤 Avançando para próximo formulário...');
      await clicarBotaoAvancar(page);
      await page.waitForTimeout(1500);
    } else {
      console.log('⚠️ Nenhum botão de avançar encontrado. Finalizando...');
      break;
    }
  }

  if (tentativas >= maxTentativas) {
    console.log('⚠️ Número máximo de tentativas atingido');
  }

  return false;
}

async function _corrigirErrosFormulario(page: Page, camposComErro: Array<{ campoId: string; campoName: string; mensagem: string; tipo: string }>, cv: string, vaga: VagaAnalisada): Promise<void> {
  console.log(`🔧 Corrigindo ${camposComErro.length} erro(s) via IA...`);
  
  const config = getSubmitterConfig();
  const profile = getSubmitterPrefillProfile();
  
  const errosJson = JSON.stringify(camposComErro, null, 2);
  const correcoes = await correctFormErrors(config.geminiApiKey || "", cv, profile, vaga, errosJson);
  
  if (correcoes && Object.keys(correcoes).length > 0) {
    console.log(`✅ IA gerou ${Object.keys(correcoes).length} correção(ões). Aplicando...`);
    await preencherFormulario(page, correcoes);
  } else {
    console.log(`⚠️ IA não conseguiu gerar correções. Retornando ao fluxo padrão...`);
    await corrigirErrosFormulario(page, camposComErro, cv);
  }
}

async function clicarBotaoCandidaturaSimplificada(page: Page): Promise<boolean> {
  try {
    const seletorClasse = '.jobs-s-apply.jobs-s-apply--fadein.inline-flex.mr2';
    await page.waitForSelector(seletorClasse, {
      state: 'attached',
      timeout: 15000
    });

    console.log('✅ Botão encontrado no DOM');

    await page.waitForTimeout(2000);

    const botao = page.locator(seletorClasse).first();
    await botao.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    await botao.click({ force: true, timeout: 5000 });
    console.log('✅ Botão "Candidatura simplificada" clicado');

    await page.waitForTimeout(3000);
    return true;
  } catch (err) {
    console.error('❌ Erro ao clicar no botão de candidatura:', err);
    return false;
  }
}

async function verificarBotaoAvancar(page: Page): Promise<boolean> {
  try {
    const botaoAvancar = await page.$('button[data-easy-apply-next-button]').catch(() => null);
    if (botaoAvancar) return true;
    const botaoAlternativo = await page.$('button[aria-label*="Avançar"]').catch(() => null);

    return botaoAlternativo !== null;

  } catch {
    return false;
  }
}

async function clicarBotaoAvancar(page: Page): Promise<boolean> {
  try {
    const botaoAvancar = await page.$('button[data-easy-apply-next-button]').catch(() => null);

    if (!botaoAvancar) {
      const botaoAlternativo = await page.$('button[aria-label*="Avançar"]').catch(() => null);
      if (!botaoAlternativo) {
        return false;
      }
      await botaoAlternativo.click();
      console.log('✅ Botão "Avançar" clicado');
      return true;
    }

    await botaoAvancar.click();
    console.log('✅ Botão "Avançar" clicado');
    return true;
  } catch (err) {
    return false;
  }
}

async function verificarCVJaAnexado(page: Page): Promise<boolean> {
  try {
    const modal = await page.$('div[data-test-modal][role="dialog"]').catch(() => null);
    if (!modal) return false;

    const cvAnexado = await page.evaluate(() => {
      const modal = document.querySelector('div[data-test-modal][role="dialog"]');
      if (!modal) return false;

      const containers = Array.from(modal.querySelectorAll('.jobs-document-upload-redesign-card__container'));
      
      if (containers.length === 0) {
        return false;
      }
      
      for (const container of containers) {
        const hasSelectedClass = container.classList.contains('jobs-document-upload-redesign-card__container--selected');
        const ariaLabel = container.getAttribute('aria-label') || '';
        const isSelectedByAria = ariaLabel === 'Selecionado' || 
                                 ariaLabel === 'Selected' || 
                                 ariaLabel.toLowerCase().includes('selecionado') ||
                                 ariaLabel.toLowerCase().includes('selected');
        
        if (hasSelectedClass) {
          const radioInput = container.querySelector('input[type="radio"]') as HTMLInputElement;
          
          if (radioInput && radioInput.checked) {
            return true;
          }
          
          if (isSelectedByAria) {
            return true;
          }
          
          return true;
        }
        
        if (isSelectedByAria) {
          const radioInput = container.querySelector('input[type="radio"]') as HTMLInputElement;
          if (radioInput && radioInput.checked) {
            return true;
          }
        }
      }
      
      return false;
    }).catch(() => false);

    return cvAnexado;
  } catch (err) {
    console.log(`   ⚠️ Erro ao verificar CV anexado: ${err}`);
    return false;
  }
}

async function verificarBotaoRevisar(page: Page): Promise<boolean> {
  try {
    const botaoRevisar = await page.$('button[aria-label*="Revisar"], button[aria-label*="Review"]').catch(() => null);
    if (botaoRevisar) return true;

    const botaoPorTexto = await page.evaluate(() => {
      const botoes = Array.from(document.querySelectorAll('button'));
      return botoes.some(btn =>
        btn.textContent?.toLowerCase().includes('revisar') ||
        btn.textContent?.toLowerCase().includes('review')
      );
    });
    return botaoPorTexto;
  } catch {
    return false;
  }
}

async function clicarBotaoRevisar(page: Page): Promise<boolean> {
  try {
    const botaoRevisar = await page.$('button[aria-label*="Revisar"], button[aria-label*="Review"]').catch(() => null);

    if (!botaoRevisar) {
      const botaoEncontrado = await page.evaluate(() => {
        const botoes = Array.from(document.querySelectorAll('button'));
        const botao = botoes.find(btn =>
          btn.textContent?.toLowerCase().includes('revisar') ||
          btn.textContent?.toLowerCase().includes('review')
        );
        if (botao) {
          botao.click();
          return true;
        }
        return false;
      });

      if (botaoEncontrado) {
        console.log('✅ Botão "Revisar" clicado');
        return true;
      }
      return false;
    }

    await botaoRevisar.click();
    console.log('✅ Botão "Revisar" clicado');
    return true;
  } catch (err) {
    return false;
  }
}

async function clicarBotaoEnviar(page: Page): Promise<boolean> {
  try {
    const botaoEnviar = await page.$('button[aria-label="Enviar candidatura"], button[aria-label*="Enviar"], button[aria-label*="Submit"], button[data-easy-apply-submit-button], button[data-live-test-easy-apply-submit-button]').catch(() => null);

    if (!botaoEnviar) {
      const botaoEncontrado = await page.evaluate(() => {
        const modal = document.querySelector('div[data-test-modal][role="dialog"]');
        if (!modal) return false;
        
        let botao = modal.querySelector('button[data-live-test-easy-apply-submit-button]') as HTMLButtonElement;
        if (botao) {
          botao.click();
          return true;
        }
        
        botao = modal.querySelector('button[aria-label="Enviar candidatura"]') as HTMLButtonElement;
        if (botao) {
          botao.click();
          return true;
        }
        
        const botoes = Array.from(modal.querySelectorAll('button'));
        botao = botoes.find(btn => {
          const texto = btn.textContent?.toLowerCase() || '';
          const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
          return texto.includes('enviar candidatura') ||
            texto.includes('submit application') ||
            ariaLabel.includes('enviar candidatura') ||
            ariaLabel.includes('submit application') ||
            btn.hasAttribute('data-live-test-easy-apply-submit-button');
        }) as HTMLButtonElement;
        
        if (botao) {
          botao.click();
          return true;
        }
        return false;
      });

      if (botaoEncontrado) {
        console.log('✅ Botão "Enviar candidatura" clicado');
        await page.waitForTimeout(1000);
        return true;
      }
      return false;
    }

    await botaoEnviar.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await botaoEnviar.click();
    console.log('✅ Botão "Enviar candidatura" clicado');
    await page.waitForTimeout(1000);
    return true;
  } catch (err) {
    console.log(`⚠️ Erro ao clicar no botão "Enviar": ${err}`);
    return false;
  }
}

async function verificarBotaoContinuarCandidatura(page: Page): Promise<boolean> {
  try {
    const modal = await page.$('div[data-test-modal][role="dialog"]').catch(() => null);
    if (!modal) return false;

    const botao = await page.$('button[aria-label*="Eu entendi as dicas"], button[aria-label*="continuar o processo"], button[id="jobs-apply-button-id"], button[data-live-test-job-apply-button]').catch(() => null);
    if (botao) return true;

    const botaoPorTexto = await page.evaluate(() => {
      const modal = document.querySelector('div[data-test-modal][role="dialog"]');
      if (!modal) return false;
      
      const botoes = Array.from(modal.querySelectorAll('button'));
      return botoes.some(btn => {
        const texto = btn.textContent?.toLowerCase().trim() || '';
        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
        return texto.includes('continuar candidatura') ||
               texto.includes('continue application') ||
               ariaLabel.includes('continuar') ||
               ariaLabel.includes('continue') ||
               btn.id === 'jobs-apply-button-id' ||
               btn.hasAttribute('data-live-test-job-apply-button');
      });
    });
    
    return botaoPorTexto;
  } catch {
    return false;
  }
}

async function clicarBotaoContinuarCandidatura(page: Page): Promise<boolean> {
  try {
    const modal = await page.$('div[data-test-modal][role="dialog"]').catch(() => null);
    if (!modal) return false;

    let botao = await page.$('button[aria-label*="Eu entendi as dicas"], button[aria-label*="continuar o processo"], button[id="jobs-apply-button-id"], button[data-live-test-job-apply-button]').catch(() => null);
    
    if (!botao) {
      const botaoEncontrado = await page.evaluate(() => {
        const modal = document.querySelector('div[data-test-modal][role="dialog"]');
        if (!modal) return false;
        
        const botoes = Array.from(modal.querySelectorAll('button'));
        const botao = botoes.find(btn => {
          const texto = btn.textContent?.toLowerCase().trim() || '';
          const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
          return texto.includes('continuar candidatura') ||
                 texto.includes('continue application') ||
                 ariaLabel.includes('continuar') ||
                 ariaLabel.includes('continue') ||
                 btn.id === 'jobs-apply-button-id' ||
                 btn.hasAttribute('data-live-test-job-apply-button');
        }) as HTMLButtonElement;
        
        if (botao) {
          botao.scrollIntoView({ behavior: 'smooth', block: 'center' });
          botao.click();
          return true;
        }
        return false;
      });
      
      if (botaoEncontrado) {
        console.log('✅ Botão "Continuar candidatura" clicado (via evaluate)');
        return true;
      }
      return false;
    }

    await botao.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await botao.click();
    console.log('✅ Botão "Continuar candidatura" clicado');
    return true;
  } catch (err) {
    console.log(`⚠️ Erro ao clicar no botão "Continuar candidatura": ${err}`);
    return false;
  }
}

async function verificarBotaoEnviarJaVisivel(page: Page): Promise<boolean> {
  try {
    const modal = await page.$('div[data-test-modal][role="dialog"]').catch(() => null);
    if (!modal) return false;

    const resultado = await page.evaluate(() => {
      const modal = document.querySelector('div[data-test-modal][role="dialog"]');
      if (!modal) return { encontrado: false, podeEnviar: false };
      
      const botoes = Array.from(modal.querySelectorAll('button'));
      
      const botaoEnviar = botoes.find(btn => {
        const texto = btn.textContent?.toLowerCase().trim() || '';
        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
        return (texto.includes('enviar candidatura') || texto.includes('submit application') ||
                ariaLabel.includes('enviar candidatura') || ariaLabel.includes('submit application') ||
                btn.hasAttribute('data-live-test-easy-apply-submit-button')) &&
               btn.offsetParent !== null &&
               !btn.hasAttribute('disabled') &&
               !btn.classList.contains('disabled');
      });
      
      if (!botaoEnviar) {
        return { encontrado: false, podeEnviar: false };
      }
      
      const botaoRevisar = botoes.find(btn => {
        const texto = btn.textContent?.toLowerCase().trim() || '';
        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
        return (texto.includes('revisar') || texto.includes('review') ||
                ariaLabel.includes('revisar') || ariaLabel.includes('review') ||
                btn.hasAttribute('data-live-test-easy-apply-review-button')) &&
               btn.offsetParent !== null;
      });
      
      const botaoAvancar = botoes.find(btn => {
        return (btn.hasAttribute('data-easy-apply-next-button') ||
                btn.getAttribute('aria-label')?.toLowerCase().includes('avançar') ||
                btn.getAttribute('aria-label')?.toLowerCase().includes('next')) &&
               btn.offsetParent !== null;
      });
      
      const podeEnviar = !botaoRevisar && !botaoAvancar;
      
      return {
        encontrado: true,
        podeEnviar: podeEnviar,
        temBotaoRevisar: !!botaoRevisar,
        temBotaoAvancar: !!botaoAvancar
      };
    });
    
    if (resultado.encontrado && resultado.podeEnviar) {
      console.log(`✅ Botão "Enviar candidatura" encontrado e não há botões de "Revisar" ou "Avançar". Formulário pronto para envio direto.`);
      return true;
    }
    
    if (resultado.encontrado) {
      console.log(`ℹ️ Botão "Enviar candidatura" encontrado, mas há botões de ação (Revisar: ${resultado.temBotaoRevisar}, Avançar: ${resultado.temBotaoAvancar}). Continuando com fluxo normal.`);
    }
    
    return false;
  } catch (err) {
    console.log(`⚠️ Erro ao verificar botão "Enviar candidatura": ${err}`);
    return false;
  }
}

async function verificarSubmissaoConcluida(page: Page): Promise<boolean> {
  try {
    await page.waitForTimeout(2000);
    
    const modalFechado = await page.evaluate(() => {
      const modal = document.querySelector('div[data-test-modal][role="dialog"]');
      return !modal || modal.getAttribute('aria-hidden') === 'true';
    }).catch(() => false);
    
    if (modalFechado) {
      console.log('✅ Modal fechado. Submissão provavelmente concluída.');
      return true;
    }
    
    const mensagemSucesso = await page.evaluate(() => {
      const texto = document.body.textContent || '';
      return texto.toLowerCase().includes('candidatura enviada') ||
             texto.toLowerCase().includes('application submitted') ||
             texto.toLowerCase().includes('candidatura enviada com sucesso') ||
             texto.toLowerCase().includes('submitted successfully');
    }).catch(() => false);
    
    if (mensagemSucesso) {
      console.log('✅ Mensagem de sucesso encontrada. Submissão concluída.');
      return true;
    }
    
    const botaoRevisarAindaExiste = await verificarBotaoRevisar(page);
    if (!botaoRevisarAindaExiste) {
      console.log('✅ Botão "Revisar" não existe mais. Submissão provavelmente concluída.');
      return true;
    }
    
    return false;
  } catch (err) {
    console.log(`⚠️ Erro ao verificar submissão: ${err}`);
    return false;
  }
}

async function detectarErrosFormulario(page: Page): Promise<Array<{ campoId: string; campoName: string; mensagem: string; tipo: string }>> {
  try {
    const erros = await page.evaluate(() => {
      const modal = document.querySelector('div[data-test-modal][role="dialog"]');
      if (!modal) return [];

      const elementosErro = Array.from(modal.querySelectorAll('.artdeco-inline-feedback--error, [role="alert"], .error-message, [data-test-form-element-error-messages]'));
      const camposComErro: Array<{ campoId: string; campoName: string; mensagem: string; tipo: string }> = [];

      elementosErro.forEach((elementoErro) => {
        const mensagem = elementoErro.textContent?.trim() || '';
        if (!mensagem) return;

        const errorContainer = elementoErro.closest('[id$="-error"]');
        if (errorContainer) {
          const errorId = errorContainer.getAttribute('id') || '';
          
          if (errorId.toLowerCase().includes('document-upload') || 
              errorId.toLowerCase().includes('file-input') ||
              errorId.toLowerCase().includes('file-upload') ||
              errorId.toLowerCase().includes('jobs-document-upload')) {
            return;
          }
          
          const campoIdBase = errorId.replace('-error', '');
          
          let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null = null;
          let tipo = 'unknown';
          
          if (campoIdBase.toLowerCase().includes('document-upload') || 
              campoIdBase.toLowerCase().includes('file-input') ||
              campoIdBase.toLowerCase().includes('file-upload') ||
              campoIdBase.toLowerCase().includes('jobs-document-upload')) {
            return;
          }
          
          input = modal.querySelector(`#${campoIdBase}`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          
          if (!input) {
            const fieldset = modal.querySelector(`fieldset#${campoIdBase}`);
            if (fieldset) {
              input = fieldset.querySelector('input[type="checkbox"], input[type="radio"]') as HTMLInputElement;
              if (input) {
                tipo = input.type;
              }
            } else if (campoIdBase.includes('checkbox-form-component')) {
              const fieldsets = modal.querySelectorAll('fieldset[data-test-checkbox-form-component]');
              for (const fs of Array.from(fieldsets)) {
                const fsId = fs.getAttribute('id') || '';
                if (fsId === campoIdBase || campoIdBase.includes(fsId) || fsId.includes(campoIdBase.split('-').slice(-5).join('-'))) {
                  input = fs.querySelector('input[type="checkbox"]') as HTMLInputElement;
                  if (input) {
                    tipo = 'checkbox';
                    break;
                  }
                }
              }
            }
          } else {
            if (input.tagName.toLowerCase() === 'input') {
              tipo = (input as HTMLInputElement).type || 'text';
              if (tipo === 'file') {
                return;
              }
            } else if (input.tagName.toLowerCase() === 'select') {
              tipo = 'select';
            } else if (input.tagName.toLowerCase() === 'textarea') {
              tipo = 'textarea';
            }
          }
          
          if (input) {
            const campoName = input.getAttribute('name') || '';
            const inputId = input.getAttribute('id') || campoIdBase;
            
            if ((input as HTMLInputElement).type === 'file' ||
                inputId.toLowerCase().includes('document-upload') ||
                inputId.toLowerCase().includes('file-input') ||
                inputId.toLowerCase().includes('file-upload') ||
                inputId.toLowerCase().includes('jobs-document-upload') ||
                campoName.toLowerCase().includes('document-upload') ||
                campoName.toLowerCase().includes('file-input') ||
                campoName.toLowerCase().includes('file-upload')) {
              return;
            }
            
            camposComErro.push({
              campoId: inputId,
              campoName: campoName,
              mensagem: mensagem,
              tipo: tipo
            });
          } else {
            let fieldset = modal.querySelector(`fieldset[id="${campoIdBase}"]`) as HTMLFieldSetElement;
            
            if (!fieldset) {
              const errorElement = errorContainer as HTMLElement;
              let currentElement: HTMLElement | null = errorElement.parentElement;
              let tentativas = 0;
              while (currentElement && tentativas < 5) {
                fieldset = currentElement.querySelector(`fieldset[data-test-checkbox-form-component]`) as HTMLFieldSetElement;
                if (fieldset) {
                  break;
                }
                currentElement = currentElement.parentElement;
                tentativas++;
              }
            }
            
            if (!fieldset) {
              const fieldsets = modal.querySelectorAll('fieldset[data-test-checkbox-form-component]');
              for (const fs of Array.from(fieldsets)) {
                const fsId = fs.getAttribute('id') || '';
                if (fsId === campoIdBase) {
                  fieldset = fs as HTMLFieldSetElement;
                  break;
                }
                if (fsId && campoIdBase && (fsId.includes(campoIdBase) || campoIdBase.includes(fsId))) {
                  fieldset = fs as HTMLFieldSetElement;
                  break;
                }
              }
            }
            
            if (fieldset) {
              const checkbox = fieldset.querySelector('input[type="checkbox"]') as HTMLInputElement;
              if (checkbox) {
                const checkboxId = checkbox.id || campoIdBase;
                const checkboxName = checkbox.name || '';
                
                if (checkboxId.toLowerCase().includes('document-upload') ||
                    checkboxId.toLowerCase().includes('file-input') ||
                    checkboxId.toLowerCase().includes('file-upload') ||
                    checkboxId.toLowerCase().includes('jobs-document-upload') ||
                    checkboxName.toLowerCase().includes('document-upload') ||
                    checkboxName.toLowerCase().includes('file-input') ||
                    checkboxName.toLowerCase().includes('file-upload')) {
                  return;
                }
                
                camposComErro.push({
                  campoId: checkboxId,
                  campoName: checkboxName,
                  mensagem: mensagem,
                  tipo: 'checkbox'
                });
              } else {
                if (!campoIdBase.toLowerCase().includes('document-upload') &&
                    !campoIdBase.toLowerCase().includes('file-input') &&
                    !campoIdBase.toLowerCase().includes('file-upload') &&
                    !campoIdBase.toLowerCase().includes('jobs-document-upload')) {
                  camposComErro.push({
                    campoId: campoIdBase,
                    campoName: '',
                    mensagem: mensagem,
                    tipo: 'checkbox'
                  });
                }
              }
            } else if (campoIdBase.includes('checkbox-form-component')) {
              const fieldsets = modal.querySelectorAll('fieldset[data-test-checkbox-form-component]');
              for (const fs of Array.from(fieldsets)) {
                const fsId = fs.getAttribute('id') || '';
                if (fsId === campoIdBase || campoIdBase.includes(fsId) || fsId.includes(campoIdBase.split('-').slice(-5).join('-'))) {
                  const checkbox = fs.querySelector('input[type="checkbox"]') as HTMLInputElement;
                  if (checkbox) {
                    const checkboxId = checkbox.id || campoIdBase;
                    const checkboxName = checkbox.name || '';
                    
                    if (!checkboxId.toLowerCase().includes('document-upload') &&
                        !checkboxId.toLowerCase().includes('file-input') &&
                        !checkboxId.toLowerCase().includes('file-upload') &&
                        !checkboxId.toLowerCase().includes('jobs-document-upload') &&
                        !checkboxName.toLowerCase().includes('document-upload') &&
                        !checkboxName.toLowerCase().includes('file-input') &&
                        !checkboxName.toLowerCase().includes('file-upload')) {
                      camposComErro.push({
                        campoId: checkboxId,
                        campoName: checkboxName,
                        mensagem: mensagem,
                        tipo: 'checkbox'
                      });
                    }
                    break;
                  }
                }
              }
            }
          }
        }
      });

      return camposComErro;
    });

    return erros;
  } catch (err) {
    console.log(`   ⚠️ Erro ao detectar erros: ${err}`);
    return [];
  }
}

async function corrigirErrosFormulario(page: Page, camposComErro: Array<{ campoId: string; campoName: string; mensagem: string; tipo: string }>, cv: string): Promise<void> {
  try {
    console.log(`🔧 Corrigindo ${camposComErro.length} campo(s) com erro...`);
    
    for (const erro of camposComErro) {
      console.log(`   🔧 Corrigindo campo: ${erro.campoId} (${erro.tipo}) - Erro: ${erro.mensagem}`);
      
      if (erro.tipo === 'checkbox' || (erro.tipo === 'unknown' && erro.campoId.includes('checkbox-form-component'))) {
        await corrigirCheckboxErro(page, erro);
      } else if (erro.tipo === 'radio') {
        await corrigirRadioErro(page, erro);
      } else if (erro.tipo === 'select') {
        await corrigirSelectErro(page, erro);
      } else if (erro.tipo === 'text' || erro.tipo === 'textarea') {
        await corrigirTextoErro(page, erro);
      }
      
      await page.waitForTimeout(500);
    }
    
    await page.waitForTimeout(1000);
  } catch (err) {
    console.log(`   ⚠️ Erro ao corrigir campos: ${err}`);
  }
}

async function corrigirCheckboxErro(page: Page, erro: { campoId: string; campoName: string; mensagem: string; tipo: string }): Promise<void> {
  try {
    console.log(`   🔧 Tentando corrigir checkbox: ${erro.campoId} (${erro.mensagem})`);
    
    if (erro.tipo === 'unknown' && erro.campoId.includes('checkbox-form-component')) {
      const checkboxInfo = await page.evaluate((fieldsetId: string) => {
        const modal = document.querySelector('div[data-test-modal][role="dialog"]');
        if (!modal) return null;
        
        const fieldset = modal.querySelector(`fieldset[id="${fieldsetId}"]`) as HTMLFieldSetElement;
        if (!fieldset) {
          const fieldsets = modal.querySelectorAll('fieldset[data-test-checkbox-form-component]');
          for (const fs of Array.from(fieldsets)) {
            const fsId = fs.getAttribute('id') || '';
            if (fsId === fieldsetId || fieldsetId.includes(fsId) || fsId.includes(fieldsetId.split('-').slice(-5).join('-'))) {
              const checkbox = fs.querySelector('input[type="checkbox"]') as HTMLInputElement;
              if (checkbox && !checkbox.checked) {
                const label = fs.querySelector(`label[for="${checkbox.id}"]`) as HTMLLabelElement;
                if (label) {
                  label.click();
                } else {
                  checkbox.click();
                }
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                checkbox.dispatchEvent(new Event('click', { bubbles: true }));
                checkbox.dispatchEvent(new Event('input', { bubbles: true }));
                return {
                  checkboxId: checkbox.id,
                  checkboxName: checkbox.name,
                  checked: checkbox.checked
                };
              }
            }
          }
          return null;
        }
        
        const checkbox = fieldset.querySelector('input[type="checkbox"]') as HTMLInputElement;
        if (checkbox && !checkbox.checked) {
          const label = fieldset.querySelector(`label[for="${checkbox.id}"]`) as HTMLLabelElement;
          if (label) {
            label.click();
          } else {
            checkbox.click();
          }
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          checkbox.dispatchEvent(new Event('click', { bubbles: true }));
          checkbox.dispatchEvent(new Event('input', { bubbles: true }));
          return {
            checkboxId: checkbox.id,
            checkboxName: checkbox.name,
            checked: checkbox.checked
          };
        }
        
        return null;
      }, erro.campoId).catch(() => null);
      
      if (checkboxInfo) {
        await page.waitForTimeout(500);
        const verificado = await page.evaluate((checkboxId: string) => {
          const modal = document.querySelector('div[data-test-modal][role="dialog"]');
          if (!modal) return false;
          const checkbox = modal.querySelector(`input[type="checkbox"]#${CSS.escape(checkboxId)}`) as HTMLInputElement;
          return checkbox ? checkbox.checked : false;
        }, checkboxInfo.checkboxId).catch(() => false);
        
        if (verificado) {
          console.log(`   ✓ Checkbox ${erro.campoId} marcado com sucesso (via fieldset)`);
          return;
        }
      }
    }
    
    const checkboxEncontrado = await page.evaluate((errorId: string) => {
      const modal = document.querySelector('div[data-test-modal][role="dialog"]');
      if (!modal) return null;
      
      let errorDiv = modal.querySelector(`div[id="${errorId}-error"]`) as HTMLElement;
      if (!errorDiv) {
        const errorDivs = modal.querySelectorAll('div[id$="-error"]');
        for (const div of Array.from(errorDivs)) {
          const divId = div.getAttribute('id') || '';
          if (divId === `${errorId}-error` || (divId.includes(errorId) && divId.endsWith('-error'))) {
            errorDiv = div as HTMLElement;
            break;
          }
        }
      }
      
      if (!errorDiv) return null;
      
      const errorIdActual = errorDiv.getAttribute('id') || '';
      const fieldsetId = errorIdActual.replace('-error', '');
      
      let fieldset = modal.querySelector(`fieldset[id="${fieldsetId}"]`) as HTMLFieldSetElement;
      
      if (!fieldset) {
        let currentElement: HTMLElement | null = errorDiv.parentElement;
        let tentativas = 0;
        while (currentElement && tentativas < 5) {
          fieldset = currentElement.querySelector(`fieldset[data-test-checkbox-form-component]`) as HTMLFieldSetElement;
          if (fieldset) break;
          currentElement = currentElement.parentElement;
          tentativas++;
        }
      }
      
      if (!fieldset) {
        const fieldsets = modal.querySelectorAll('fieldset[data-test-checkbox-form-component]');
        for (const fs of Array.from(fieldsets)) {
          const fsId = fs.getAttribute('id') || '';
          if (fsId === fieldsetId || fieldsetId.includes(fsId) || fsId.includes(fieldsetId.split('-').slice(-5).join('-'))) {
            fieldset = fs as HTMLFieldSetElement;
            break;
          }
        }
      }
      
      if (!fieldset && errorId.includes('checkbox-form-component')) {
        const fieldsets = modal.querySelectorAll('fieldset[data-test-checkbox-form-component]');
        for (const fs of Array.from(fieldsets)) {
          const fsId = fs.getAttribute('id') || '';
          if (fsId === errorId || errorId.includes(fsId) || fsId.includes(errorId.split('-').slice(-5).join('-'))) {
            fieldset = fs as HTMLFieldSetElement;
            break;
          }
        }
      }
      
      if (fieldset) {
        const checkbox = fieldset.querySelector('input[type="checkbox"]') as HTMLInputElement;
        if (checkbox) {
          const label = fieldset.querySelector(`label[for="${checkbox.id}"]`) as HTMLLabelElement;
          
          if (!checkbox.checked) {
            if (label) {
              label.click();
            } else {
              checkbox.click();
            }
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            checkbox.dispatchEvent(new Event('click', { bubbles: true }));
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
          }
          
          return {
            checkboxId: checkbox.id,
            checkboxName: checkbox.name,
            checked: checkbox.checked
          };
        }
      }
      
      return null;
    }, erro.campoId).catch(() => null);
    
    if (checkboxEncontrado) {
      await page.waitForTimeout(500);
      const verificado = await page.evaluate((checkboxId: string) => {
        const modal = document.querySelector('div[data-test-modal][role="dialog"]');
        if (!modal) return false;
        const checkbox = modal.querySelector(`input[type="checkbox"]#${CSS.escape(checkboxId)}`) as HTMLInputElement;
        return checkbox ? checkbox.checked : false;
      }, checkboxEncontrado.checkboxId).catch(() => false);
      
      if (verificado) {
        console.log(`   ✓ Checkbox ${erro.campoId} marcado com sucesso`);
        return;
      }
    }
    
    if (erro.campoId.includes('checkbox-form-component')) {
      const fieldsetEncontrado = await page.evaluate((fieldsetId: string) => {
        const modal = document.querySelector('div[data-test-modal][role="dialog"]');
        if (!modal) return null;
        
        const fieldsets = modal.querySelectorAll('fieldset[data-test-checkbox-form-component]');
        for (const fs of Array.from(fieldsets)) {
          const fsId = fs.getAttribute('id') || '';
          if (fsId === fieldsetId || fieldsetId.includes(fsId) || fsId.includes(fieldsetId.split('-').slice(-5).join('-'))) {
            const checkbox = fs.querySelector('input[type="checkbox"]') as HTMLInputElement;
            if (checkbox && !checkbox.checked) {
              const label = fs.querySelector(`label[for="${checkbox.id}"]`) as HTMLLabelElement;
              if (label) {
                label.click();
              } else {
                checkbox.click();
              }
              checkbox.checked = true;
              checkbox.dispatchEvent(new Event('change', { bubbles: true }));
              checkbox.dispatchEvent(new Event('click', { bubbles: true }));
              checkbox.dispatchEvent(new Event('input', { bubbles: true }));
              return {
                checkboxId: checkbox.id,
                checked: checkbox.checked
              };
            }
          }
        }
        return null;
      }, erro.campoId).catch(() => null);
      
      if (fieldsetEncontrado) {
        await page.waitForTimeout(500);
        const verificado = await page.evaluate((checkboxId: string) => {
          const modal = document.querySelector('div[data-test-modal][role="dialog"]');
          if (!modal) return false;
          const checkbox = modal.querySelector(`input[type="checkbox"]#${CSS.escape(checkboxId)}`) as HTMLInputElement;
          return checkbox ? checkbox.checked : false;
        }, fieldsetEncontrado.checkboxId).catch(() => false);
        
        if (verificado) {
          console.log(`   ✓ Checkbox ${erro.campoId} marcado com sucesso (via fieldset fallback)`);
          return;
        }
      }
    }
    
    let campo = await page.$(`input[type="checkbox"]#${erro.campoId}`).catch(() => null);
    
    if (!campo && erro.campoName) {
      campo = await page.$(`input[type="checkbox"][name="${erro.campoName}"]`).catch(() => null);
    }
    
    if (!campo) {
      const errorIdBase = erro.campoId.replace('-error', '');
      const fieldset = await page.$(`fieldset[id="${errorIdBase}"]`).catch(() => null);
      if (fieldset) {
        campo = await fieldset.$('input[type="checkbox"]').catch(() => null);
      }
    }
    
    if (!campo) {
      const fieldsets = await page.$$('fieldset[data-test-checkbox-form-component]').catch(() => []);
      for (const fieldset of fieldsets) {
        const fsId = await fieldset.getAttribute('id').catch(() => '');
        if (fsId && erro.campoId.includes(fsId.replace('checkbox-form-component-', '').split('-')[0])) {
          campo = await fieldset.$('input[type="checkbox"]').catch(() => null);
          if (campo) break;
        }
      }
    }
    
    if (campo) {
      await campo.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      
      const isChecked = await campo.isChecked().catch(() => false);
      if (!isChecked) {
        const checkboxId = await campo.getAttribute('id').catch(() => '');
        
        if (checkboxId) {
          try {
            const label = await page.locator(`label[for="${checkboxId}"]`).first();
            const labelExists = await label.count().catch(() => 0);
            if (labelExists > 0) {
              await label.click({ timeout: 2000 });
              await page.waitForTimeout(300);
            }
          } catch (e) {
            console.log(`   ℹ️ Não foi possível clicar no label, tentando diretamente no checkbox...`);
          }
        }
        
        try {
          await campo.setChecked(true);
          await page.waitForTimeout(200);
        } catch (e) {
          await campo.click();
          await page.waitForTimeout(200);
        }
        
        await campo.evaluate((el: HTMLInputElement) => {
          el.checked = true;
          el.setAttribute('checked', 'checked');
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('click', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        
        await page.waitForTimeout(300);
        
        const verificado = await campo.isChecked().catch(() => false);
        if (verificado) {
          console.log(`   ✓ Checkbox ${erro.campoId} marcado com sucesso`);
        } else {
          console.log(`   ⚠️ Checkbox ${erro.campoId} pode não ter sido marcado, tentando método alternativo...`);
          
          await campo.evaluate((el: HTMLInputElement) => {
            el.setAttribute('checked', 'checked');
            el.checked = true;
            const changeEvent = new Event('change', { bubbles: true });
            el.dispatchEvent(changeEvent);
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
            el.dispatchEvent(clickEvent);
            const inputEvent = new Event('input', { bubbles: true });
            el.dispatchEvent(inputEvent);
          });
          
          await page.waitForTimeout(200);
          const verificadoNovamente = await campo.isChecked().catch(() => false);
          if (verificadoNovamente) {
            console.log(`   ✓ Checkbox ${erro.campoId} marcado com sucesso (método alternativo)`);
          } else {
            console.log(`   ⚠️ Checkbox ${erro.campoId} ainda não foi marcado após todas as tentativas`);
          }
        }
      } else {
        console.log(`   ⊘ Checkbox ${erro.campoId} já estava marcado`);
      }
    } else {
      console.log(`   ⚠️ Checkbox ${erro.campoId} não encontrado. Tentando método de busca direta...`);
      
      const todosCheckboxes = await page.$$('fieldset[data-test-checkbox-form-component] input[type="checkbox"]').catch(() => []);
      for (const checkbox of todosCheckboxes) {
        const isChecked = await checkbox.isChecked().catch(() => false);
        if (!isChecked) {
          await checkbox.scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);
          await checkbox.setChecked(true);
          await page.waitForTimeout(300);
          const verificado = await checkbox.isChecked().catch(() => false);
          if (verificado) {
            console.log(`   ✓ Checkbox não marcado encontrado e marcado com sucesso`);
            break;
          }
        }
      }
    }
  } catch (err) {
    console.log(`   ⚠️ Erro ao corrigir checkbox: ${err}`);
  }
}

async function corrigirRadioErro(page: Page, erro: { campoId: string; campoName: string; mensagem: string; tipo: string }): Promise<void> {
  try {
    if (erro.campoName) {
      const radios = await page.locator(`input[type="radio"][name="${erro.campoName}"]`).all();
      if (radios.length > 0) {
        const primeiroRadio = radios[0];
        await primeiroRadio.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        
        const radioId = await primeiroRadio.getAttribute('id').catch(() => '');
        if (radioId) {
          const label = await page.$(`label[for="${radioId}"]`).catch(() => null);
          if (label) {
            await label.click();
            await page.waitForTimeout(300);
            console.log(`   ✓ Radio button ${erro.campoName} selecionado`);
          } else {
            await primeiroRadio.click();
            await page.waitForTimeout(300);
            console.log(`   ✓ Radio button ${erro.campoName} selecionado (direto)`);
          }
        }
      }
    }
  } catch (err) {
    console.log(`   ⚠️ Erro ao corrigir radio: ${err}`);
  }
}

async function corrigirSelectErro(page: Page, erro: { campoId: string; campoName: string; mensagem: string; tipo: string }): Promise<void> {
  try {
    let select = await page.$(`select#${erro.campoId}`).catch(() => null);
    
    if (!select && erro.campoName) {
      select = await page.$(`select[name="${erro.campoName}"]`).catch(() => null);
    }
    
    if (!select) {
      select = await page.$(`select[data-test-text-entity-list-form-select]`).catch(() => null);
    }
    
    if (!select) {
      const selectEncontrado = await page.evaluate(({ selectId, selectName }: { selectId: string; selectName: string }) => {
        const modal = document.querySelector('div[data-test-modal][role="dialog"]');
        if (!modal) return null;
        
        let select = modal.querySelector(`select#${selectId}`) as HTMLSelectElement;
        if (!select && selectName) {
          select = modal.querySelector(`select[name="${selectName}"]`) as HTMLSelectElement;
        }
        if (!select) {
          const selects = modal.querySelectorAll('select[data-test-text-entity-list-form-select]');
          for (const s of Array.from(selects)) {
            const sId = s.getAttribute('id') || '';
            const sName = s.getAttribute('name') || '';
            if (sId === selectId || sName === selectName || selectId.includes(sId) || sId.includes(selectId)) {
              select = s as HTMLSelectElement;
              break;
            }
          }
        }
        
        if (select) {
          const options = Array.from(select.options);
          for (let i = 1; i < options.length; i++) {
            const option = options[i];
            const value = option.value || '';
            const text = option.textContent?.trim() || '';
            if (value && value !== 'Select an option' && text && !text.toLowerCase().includes('select an option')) {
              select.value = value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              select.dispatchEvent(new Event('input', { bubbles: true }));
              return {
                selectId: select.id,
                value: value
              };
            }
          }
        }
        return null;
      }, { selectId: erro.campoId, selectName: erro.campoName || '' }).catch(() => null);
      
      if (selectEncontrado) {
        await page.waitForTimeout(300);
        console.log(`   ✓ Select ${erro.campoId} preenchido com "${selectEncontrado.value}" (via evaluate)`);
        return;
      }
    }
    
    if (select) {
      const options = await select.$$('option').catch(() => []);
      if (options.length > 1) {
        for (let i = 1; i < options.length; i++) {
          const option = options[i];
          const value = await option.getAttribute('value').catch(() => '');
          const text = await option.textContent().catch(() => '') || '';
          if (value && value !== 'Select an option' && text && !text.toLowerCase().includes('select an option')) {
            await select.selectOption(value);
            await page.waitForTimeout(300);
            console.log(`   ✓ Select ${erro.campoId} preenchido com "${value}"`);
            break;
          }
        }
      }
    } else {
      console.log(`   ⚠️ Select ${erro.campoId} não encontrado`);
    }
  } catch (err) {
    console.log(`   ⚠️ Erro ao corrigir select: ${err}`);
  }
}

async function corrigirTextoErro(page: Page, erro: { campoId: string; campoName: string; mensagem: string; tipo: string }): Promise<void> {
  try {
    const campo = await page.$(`input#${erro.campoId}, textarea#${erro.campoId}`).catch(() => null);
    if (campo) {
      const valorAtual = await campo.inputValue().catch(() => '');
      if (!valorAtual || valorAtual.trim() === '') {
        await campo.fill('N/A');
        await page.waitForTimeout(300);
        console.log(`   ✓ Campo de texto ${erro.campoId} preenchido`);
      }
    }
  } catch (err) {
    console.log(`   ⚠️ Erro ao corrigir texto: ${err}`);
  }
}

async function capturarFormulario(page: Page): Promise<string | null> {
  try {
    console.log('📋 Capturando formulário...');

    const formHTML = await page.evaluate(() => {
      const modal = document.querySelector('div[data-test-modal][role="dialog"]');
      if (!modal) return null;

      const form = modal.querySelector('form');
      if (!form) return null;

      const campos: Array<{
        tipo: string;
        label?: string;
        placeholder?: string;
        name?: string;
        id?: string;
        required?: boolean;
        options?: string[];
      }> = [];
      
      const radioGroupsProcessados = new Set<string>();
      const camposProcessados = new Set<string>();

      form.querySelectorAll('input, textarea, select').forEach((el: Element, index: number) => {
        const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const inputElement = input as HTMLInputElement;

        if (inputElement.type === 'file') {
          return;
        }

        if (inputElement.id?.toLowerCase().includes('document-upload') || 
            inputElement.id?.toLowerCase().includes('file-input') ||
            inputElement.id?.toLowerCase().includes('file-upload') ||
            inputElement.id?.toLowerCase().includes('jobs-document-upload') ||
            inputElement.name?.toLowerCase().includes('document-upload') ||
            inputElement.name?.toLowerCase().includes('file-input') ||
            inputElement.name?.toLowerCase().includes('file-upload')) {
          return;
        }

        if (inputElement.type === 'radio') {
          const radioName = inputElement.name || '';
          if (!radioName) return;
          
          if (radioGroupsProcessados.has(radioName)) {
            return;
          }
          
          radioGroupsProcessados.add(radioName);
          
          const fieldset = input.closest('fieldset');
          let labelText = '';
          if (fieldset) {
            const legend = fieldset.querySelector('legend');
            if (legend) {
              const labelElement = legend.querySelector('[data-test-form-builder-radio-button-form-component__title], .fb-dash-form-element__label');
              if (labelElement) {
                labelText = labelElement.textContent?.trim() || '';
              } else {
                labelText = legend.textContent?.trim() || '';
              }
            }
          }
          
          const radioButtons = Array.from(form.querySelectorAll(`input[type="radio"][name="${radioName}"]`)) as HTMLInputElement[];
          const opcoes = radioButtons.map(radio => {
            const dataTestAttr = radio.getAttribute('data-test-text-selectable-option__input') || '';
            const label = form.querySelector(`label[for="${radio.id}"]`) as HTMLLabelElement;
            let labelText = '';
            
            if (label) {
              const textNodes = Array.from(label.childNodes).filter(node => {
                if (node.nodeType !== Node.TEXT_NODE) return false;
                const parent = node.parentElement;
                if (parent && (parent.classList.contains('a11y-text') || parent.classList.contains('visually-hidden'))) {
                  return false;
                }
                return true;
              });
              
              if (textNodes.length > 0) {
                labelText = textNodes.map(node => node.textContent?.trim() || '').filter(t => t.length > 0).join(' ').trim();
              }
              
              if (!labelText) {
                const visibleText = Array.from(label.childNodes).find(node => {
                  if (node.nodeType === Node.TEXT_NODE) return true;
                  if (node.nodeType === Node.ELEMENT_NODE) {
                    const el = node as Element;
                    return !el.classList.contains('a11y-text') && !el.classList.contains('visually-hidden');
                  }
                  return false;
                });
                if (visibleText) {
                  labelText = visibleText.textContent?.trim() || '';
                }
              }
              
              if (!labelText) {
                labelText = label.textContent?.trim() || '';
                const hiddenSpan = label.querySelector('.visually-hidden, .a11y-text');
                if (hiddenSpan && hiddenSpan.textContent) {
                  const hiddenText = hiddenSpan.textContent.trim();
                  if (labelText && hiddenText && hiddenText !== labelText) {
                    labelText = labelText.replace(hiddenText, '').trim();
                  }
                }
              }
            }
            
            if (!labelText) {
              labelText = dataTestAttr || radio.value || '';
            }
            
            return {
              value: radio.value || '',
              text: labelText,
              dataTest: dataTestAttr,
              id: radio.id
            };
          });
          
          const algumMarcado = radioButtons.some(radio => radio.checked);
          
          if (algumMarcado) {
            return;
          }
          
          const primeiroRadio = radioButtons[0];
          const required = primeiroRadio.hasAttribute('required') || primeiroRadio.hasAttribute('aria-required');
          
          const campo: any = {
            tipo: 'radio-group',
            tipoInput: 'radio',
            label: labelText || undefined,
            name: radioName,
            id: primeiroRadio.id || undefined,
            required: required,
            checked: false,
            options: opcoes,
            dataTestId: primeiroRadio.getAttribute('data-test-text-selectable-option__input') || undefined,
          };

          const identificador = campo.name || campo.id || campo.dataTestId || `campo_${index}`;
          campos.push({
            ...campo,
            identificador
          });
          
          return;
        }

        let estaPreenchido = false;

        if (inputElement.type === 'checkbox') {
          estaPreenchido = inputElement.checked;
        } else if (input.tagName.toLowerCase() === 'select') {
          const select = input as HTMLSelectElement;
          const valorAtual = select.value || '';
          const selectedOption = select.options[select.selectedIndex];
          const textoAtual = selectedOption?.textContent?.trim() || '';
          
          const valoresPlaceholder = [
            'select an option',
            'selecione uma opção',
            'selecione',
            'escolha uma opção',
            'choose an option',
            'seleccione una opción',
            ''
          ];
          
          const valorNormalizado = valorAtual.toLowerCase().trim();
          const textoNormalizado = textoAtual.toLowerCase().trim();
          const isPlaceholder = valoresPlaceholder.includes(valorNormalizado) || 
                             valoresPlaceholder.some(placeholder => textoNormalizado.includes(placeholder));
          
          estaPreenchido = !isPlaceholder && valorAtual.trim() !== '';
        } else {
          const valorAtual = (input as HTMLInputElement | HTMLTextAreaElement).value || '';
          estaPreenchido = valorAtual.trim() !== '';
        }

        if (estaPreenchido) {
          return;
        }

        let labelText = '';
        let labelElement: HTMLLabelElement | null = null;
        
        if (inputElement.type === 'checkbox') {
          const fieldset = input.closest('fieldset[data-test-checkbox-form-component]');
          if (fieldset) {
            const legend = fieldset.querySelector('legend');
            if (legend) {
              const legendLabel = legend.querySelector('[data-test-checkbox-form-title], .fb-dash-form-element__label');
              if (legendLabel) {
                const textNodes = Array.from(legendLabel.childNodes).filter(node => {
                  if (node.nodeType !== Node.TEXT_NODE) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                      const el = node as Element;
                      return !el.classList.contains('a11y-text') && !el.classList.contains('visually-hidden');
                    }
                    return false;
                  }
                  return true;
                });
                if (textNodes.length > 0) {
                  labelText = textNodes.map(node => node.textContent?.trim() || '').filter(t => t.length > 0).join(' ').trim();
                } else {
                  labelText = legendLabel.textContent?.trim() || '';
                  const hiddenSpan = legendLabel.querySelector('.visually-hidden, .a11y-text');
                  if (hiddenSpan && hiddenSpan.textContent) {
                    const hiddenText = hiddenSpan.textContent.trim();
                    if (labelText && hiddenText && hiddenText !== labelText) {
                      labelText = labelText.replace(hiddenText, '').trim();
                    }
                  }
                }
                if (!labelText) {
                  labelText = legend.textContent?.trim() || '';
                }
              } else {
                labelText = legend.textContent?.trim() || '';
              }
            }
          }
        }
        
        if (!labelText) {
          const labelFor = input.id ? form.querySelector(`label[for="${input.id}"]`) as HTMLLabelElement : null;
          if (labelFor) {
            labelElement = labelFor;
            const textNodes = Array.from(labelFor.childNodes).filter(node => {
              if (node.nodeType !== Node.TEXT_NODE) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const el = node as Element;
                  return !el.classList.contains('a11y-text') && !el.classList.contains('visually-hidden');
                }
                return false;
              }
              return true;
            });
            if (textNodes.length > 0) {
              labelText = textNodes.map(node => node.textContent?.trim() || '').filter(t => t.length > 0).join(' ').trim();
            } else {
              labelText = labelFor.textContent?.trim() || '';
            }
          } else {
            const labelClosest = input.closest('label') as HTMLLabelElement;
            if (labelClosest) {
              labelElement = labelClosest;
              const textNodes = Array.from(labelClosest.childNodes).filter(node => {
                if (node.nodeType !== Node.TEXT_NODE) {
                  if (node.nodeType === Node.ELEMENT_NODE) {
                    const el = node as Element;
                    return !el.classList.contains('a11y-text') && !el.classList.contains('visually-hidden');
                  }
                  return false;
                }
                return true;
              });
              if (textNodes.length > 0) {
                labelText = textNodes.map(node => node.textContent?.trim() || '').filter(t => t.length > 0).join(' ').trim();
              } else {
                labelText = labelClosest.textContent?.trim() || '';
              }
            } else {
              const parentDiv = input.closest('div');
              if (parentDiv) {
                const labelInDiv = parentDiv.querySelector('label') as HTMLLabelElement;
                if (labelInDiv) {
                  labelElement = labelInDiv;
                  const textNodes = Array.from(labelInDiv.childNodes).filter(node => {
                    if (node.nodeType !== Node.TEXT_NODE) {
                      if (node.nodeType === Node.ELEMENT_NODE) {
                        const el = node as Element;
                        return !el.classList.contains('a11y-text') && !el.classList.contains('visually-hidden');
                      }
                      return false;
                    }
                    return true;
                  });
                  if (textNodes.length > 0) {
                    labelText = textNodes.map(node => node.textContent?.trim() || '').filter(t => t.length > 0).join(' ').trim();
                  } else {
                    labelText = labelInDiv.textContent?.trim() || '';
                  }
                } else {
                  const labelSibling = input.previousElementSibling;
                  if (labelSibling && labelSibling.tagName.toLowerCase() === 'label') {
                    labelElement = labelSibling as HTMLLabelElement;
                    labelText = labelSibling.textContent?.trim() || '';
                  }
                }
              }
            }
          }
        }

        if (input.tagName.toLowerCase() === 'input' || input.tagName.toLowerCase() === 'textarea') {
          labelText = labelText.replace(input.value || '', '').trim();
        }

        if (inputElement.type === 'file') {
          return;
        }

        const isNumeric = inputElement.inputMode === 'numeric' || 
                         inputElement.type === 'number' || 
                         inputElement.id?.toLowerCase().includes('numeric') ||
                         inputElement.id?.toLowerCase().includes('number');

        const isAutocomplete = inputElement.getAttribute('role') === 'combobox' ||
                               inputElement.getAttribute('aria-autocomplete') === 'list' ||
                               inputElement.className?.includes('typeahead') ||
                               inputElement.id?.toLowerCase().includes('typeahead') ||
                               inputElement.id?.toLowerCase().includes('autocomplete');
        
        if (inputElement.id?.toLowerCase().includes('document-upload') || 
            inputElement.id?.toLowerCase().includes('file-input') ||
            inputElement.id?.toLowerCase().includes('file-upload')) {
          return;
        }

        let isRequired = input.hasAttribute('required') || inputElement.hasAttribute('aria-required');
        
        if (inputElement.type === 'checkbox') {
          const fieldset = input.closest('fieldset[data-test-checkbox-form-component]');
          if (fieldset) {
            const requiredIndicator = fieldset.querySelector('[data-test-checkbox-form-required], .visually-hidden[data-test-checkbox-form-required]');
            if (requiredIndicator) {
              const requiredText = requiredIndicator.textContent?.toLowerCase() || '';
              if (requiredText.includes('obrigatório') || requiredText.includes('required')) {
                isRequired = true;
              }
            }
            const legend = fieldset.querySelector('legend');
            if (legend) {
              const legendLabel = legend.querySelector('.fb-dash-form-element__label-title--is-required');
              if (legendLabel) {
                isRequired = true;
              }
            }
          }
        }
        
        const campo: any = {
          tipo: input.tagName.toLowerCase(),
          tipoInput: inputElement.type || undefined,
          inputmode: inputElement.inputMode || undefined,
          isNumeric: isNumeric,
          isAutocomplete: isAutocomplete,
          label: labelText || undefined,
          placeholder: inputElement.placeholder || undefined,
          name: input.name || undefined,
          id: input.id || undefined,
          required: isRequired,
          valorAtual: input.value || undefined,
          checked: inputElement.type === 'checkbox' || inputElement.type === 'radio' ? inputElement.checked : undefined,
          labelFor: labelElement?.htmlFor || undefined,
          dataTestId: inputElement.getAttribute('data-test-text-selectable-option__input') || 
                     inputElement.getAttribute('data-test-id') || undefined,
        };

        if (input.tagName.toLowerCase() === 'select') {
          const select = input as HTMLSelectElement;
          campo.options = Array.from(select.options)
            .filter(opt => opt.value !== '')
            .map(opt => ({
              value: opt.value,
              text: opt.textContent?.trim() || opt.value
            }));
        }

        const identificador = campo.id || campo.name || campo.dataTestId || `campo_${index}`;
        
        if (camposProcessados.has(identificador)) {
          return;
        }
        camposProcessados.add(identificador);

        campos.push({
          ...campo,
          identificador
        });
      });

      return JSON.stringify(campos, null, 2);
    });

    if (!formHTML) {
      console.log('⚠️ Nenhum formulário encontrado na página');
      return null;
    }

    console.log('✅ Formulário capturado');
    return formHTML;
  } catch (err) {
    console.error('❌ Erro ao capturar formulário:', err);
    return null;
  }
}


async function preencherFormulario(page: Page, respostas: Record<string, string>): Promise<number> {
  try {
    console.log('✍️ Preenchendo formulário...');

    const modal = await page.$('div[data-test-modal][role="dialog"]').catch(() => null);
    if (!modal) {
      console.log('⚠️ Modal não encontrado');
      return 0;
    }

    let camposPreenchidos = 0;
    const radioButtonsProcessados = new Set<string>();

    for (const [identificador, resposta] of Object.entries(respostas)) {
      try {
        const identificadorEscaped = identificador.replace(/[#.]/g, '\\$&');
        
        const isRadioGroup = await page.evaluate((name: string) => {
          const modal = document.querySelector('div[data-test-modal][role="dialog"]');
          if (!modal) return false;
          const radios = Array.from(modal.querySelectorAll(`input[type="radio"][name="${name}"]`)) as HTMLInputElement[];
          return radios.length > 0;
        }, identificador).catch(() => false);
        
        if (isRadioGroup) {
          if (radioButtonsProcessados.has(identificador)) {
            console.log(`   ⊘ Radio button do grupo "${identificador}" já foi processado`);
            continue;
          }

          const radioJaMarcado = await page.evaluate((name: string) => {
            const modal = document.querySelector('div[data-test-modal][role="dialog"]');
            if (!modal) return false;
            const radios = Array.from(modal.querySelectorAll(`input[type="radio"][name="${name}"]`)) as HTMLInputElement[];
            return radios.some(radio => radio.checked);
          }, identificador).catch(() => false);

          if (radioJaMarcado) {
            console.log(`   ⊘ Radio button do grupo "${identificador}" já está marcado`);
            radioButtonsProcessados.add(identificador);
            continue;
          }

          radioButtonsProcessados.add(identificador);
          
          console.log(`   ✓ Processando radio group "${identificador}" com resposta: "${resposta}"`);
          
          let radioMarcadoComSucesso = false;
          
          try {
            const radios = await page.locator(`input[type="radio"][name="${identificador}"]`).all();
            const respostaLower = resposta.toLowerCase().trim();
            
            if (radios.length === 0) {
              console.log(`   ⚠️ Nenhum radio button encontrado para o grupo "${identificador}"`);
              continue;
            }
            
            for (const radio of radios) {
              try {
                const radioId = await radio.getAttribute('id').catch(() => '');
                const dataTest = await radio.getAttribute('data-test-text-selectable-option__input').catch(() => '');
                const value = await radio.getAttribute('value').catch(() => '');
                
                let labelText = '';
                if (radioId) {
                  const label = page.locator(`label[for="${radioId}"]`);
                  const labelExists = await label.count().catch(() => 0);
                  if (labelExists > 0) {
                    labelText = await label.textContent().catch(() => '') || '';
                    labelText = labelText.trim();
                  }
                }
                
                const dataTestLower = (dataTest || '').toLowerCase();
                const labelTextLower = (labelText || '').toLowerCase();
                const valueLower = (value || '').toLowerCase();
                
                const match = 
                  dataTestLower === respostaLower || 
                  labelTextLower === respostaLower ||
                  valueLower === respostaLower ||
                  dataTestLower.includes(respostaLower) ||
                  labelTextLower.includes(respostaLower) ||
                  respostaLower.includes(dataTestLower) ||
                  respostaLower.includes(labelTextLower) ||
                  (respostaLower === 'yes' && (dataTestLower === 'yes' || labelTextLower === 'yes' || labelTextLower.startsWith('yes') || valueLower === '1')) ||
                  (respostaLower === 'no' && (dataTestLower === 'no' || labelTextLower === 'no' || labelTextLower.startsWith('no') || valueLower === '0')) ||
                  (respostaLower === 'sim' && (dataTestLower.includes('sim') || labelTextLower.includes('sim'))) ||
                  ((respostaLower === 'não' || respostaLower === 'nao') && (dataTestLower.includes('não') || dataTestLower.includes('nao') || labelTextLower.includes('não') || labelTextLower.includes('nao')));
                
                if (match) {
                  await radio.scrollIntoViewIfNeeded();
                  await page.waitForTimeout(200);
                  
                  if (radioId) {
                    const label = page.locator(`label[for="${radioId}"]`);
                    const labelExists = await label.count().catch(() => 0);
                    if (labelExists > 0) {
                      try {
                        await label.click({ timeout: 2000 });
                      } catch {
                        await radio.click({ timeout: 2000 });
                      }
                    } else {
                      await radio.click({ timeout: 2000 });
                    }
                  } else {
                    await radio.click({ timeout: 2000 });
                  }
                  
                  await page.waitForTimeout(300);
                  
                  const isChecked = await radio.isChecked().catch(() => false);
                  if (isChecked) {
                    console.log(`   ✓ Radio button marcado com sucesso para "${resposta}" (${labelText || dataTest || value})`);
                    radioMarcadoComSucesso = true;
                    camposPreenchidos++;
                    break;
                  } else {
                    await radio.evaluate((el: HTMLInputElement) => {
                      el.checked = true;
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                      el.dispatchEvent(new Event('click', { bubbles: true }));
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                    await page.waitForTimeout(200);
                    const isCheckedAfter = await radio.isChecked().catch(() => false);
                    if (isCheckedAfter) {
                      console.log(`   ✓ Radio button marcado com sucesso (forçado) para "${resposta}"`);
                      radioMarcadoComSucesso = true;
                      camposPreenchidos++;
                      break;
                    }
                  }
                }
              } catch (err: any) {
                console.log(`   ⚠️ Erro ao processar radio button: ${err.message}`);
              }
            }
            
            if (!radioMarcadoComSucesso) {
              console.log(`   ⚠️ Não foi possível encontrar radio button correspondente a "${resposta}" no grupo "${identificador}"`);
              console.log(`   ℹ️ Tentando método alternativo via evaluate...`);
              
              const marcadoViaEvaluate = await page.evaluate(({ radioName, resposta }: { radioName: string; resposta: string }) => {
                const modal = document.querySelector('div[data-test-modal][role="dialog"]');
                if (!modal) return false;
                
                const radios = Array.from(modal.querySelectorAll(`input[type="radio"][name="${radioName}"]`)) as HTMLInputElement[];
                const respostaLower = resposta.toLowerCase().trim();
                
                for (const radio of radios) {
                  const dataTestAttr = (radio.getAttribute('data-test-text-selectable-option__input') || '').toLowerCase();
                  const label = modal.querySelector(`label[for="${radio.id}"]`) as HTMLLabelElement;
                  const labelText = label ? (label.textContent?.trim() || '').toLowerCase() : '';
                  const value = (radio.value || '').toLowerCase();
                  
                  if (dataTestAttr === respostaLower || 
                      labelText === respostaLower ||
                      value === respostaLower ||
                      dataTestAttr.includes(respostaLower) ||
                      labelText.includes(respostaLower) ||
                      respostaLower.includes(dataTestAttr) ||
                      respostaLower.includes(labelText) ||
                      (respostaLower === 'yes' && (dataTestAttr === 'yes' || labelText === 'yes' || value === '1')) ||
                      (respostaLower === 'no' && (dataTestAttr === 'no' || labelText === 'no' || value === '0'))) {
                    
                    if (label) {
                      label.click();
                    } else {
                      radio.click();
                    }
                    
                    radio.checked = true;
                    radio.dispatchEvent(new Event('change', { bubbles: true }));
                    radio.dispatchEvent(new Event('click', { bubbles: true }));
                    radio.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    return true;
                  }
                }
                return false;
              }, { radioName: identificador, resposta: resposta }).catch(() => false);
              
              if (marcadoViaEvaluate) {
                await page.waitForTimeout(300);
                const verificado = await page.evaluate((name: string) => {
                  const modal = document.querySelector('div[data-test-modal][role="dialog"]');
                  if (!modal) return false;
                  const radios = Array.from(modal.querySelectorAll(`input[type="radio"][name="${name}"]`)) as HTMLInputElement[];
                  return radios.some(radio => radio.checked);
                }, identificador).catch(() => false);
                
                if (verificado) {
                  console.log(`   ✓ Radio button marcado com sucesso (evaluate) para "${resposta}"`);
                  radioMarcadoComSucesso = true;
                  camposPreenchidos++;
                }
              }
            }
            
            if (radioMarcadoComSucesso) {
              await page.waitForTimeout(300);
              continue;
            } else {
              console.log(`   ⚠️ Falha ao marcar radio button para "${resposta}" no grupo "${identificador}"`);
              continue;
            }
          } catch (err: any) {
            console.log(`   ⚠️ Erro ao processar radio group: ${err.message}`);
            continue;
          }
        }
        
        if (identificador.toLowerCase().includes('document-upload') || 
            identificador.toLowerCase().includes('file-input') ||
            identificador.toLowerCase().includes('file-upload') ||
            identificador.toLowerCase().includes('jobs-document-upload')) {
          console.log(`   ⊘ Campo ${identificador} é de upload de arquivo. Ignorando...`);
          continue;
        }
        
        let campo = await modal.$(`input[data-test-text-selectable-option__input="${identificador}"]`).catch(() => null);

        if (!campo) {
          campo = await modal.$(`#${identificadorEscaped}`).catch(() => null);
        }

        if (!campo) {
          campo = await modal.$(`[name="${identificador}"]`).catch(() => null);
        }

        if (!campo) {
          campo = await modal.$(`input[data-test-text-selectable-option__input*="${identificador}"]`).catch(() => null);
        }
        
        if (campo) {
          const campoType = await campo.evaluate((el: Element) => {
            return (el as HTMLInputElement).type || '';
          }).catch(() => '');
          
          if (campoType === 'file') {
            console.log(`   ⊘ Campo ${identificador} é do tipo file. Ignorando...`);
            continue;
          }
        }

        if (!campo) {
          const campoEncontrado = await page.evaluate((id) => {
            const modal = document.querySelector('div[data-test-modal][role="dialog"]');
            if (!modal) return null;
            const inputs = Array.from(modal.querySelectorAll('input, textarea, select'));
            return inputs.find((el: any) => {
              const dataTestAttr = el.getAttribute('data-test-text-selectable-option__input');
              const labelText = (() => {
                const label = el.id ? modal.querySelector(`label[for="${el.id}"]`) : null;
                if (label) return label.textContent?.trim().toLowerCase();
                const parentDiv = el.closest('div');
                if (parentDiv) {
                  const labelInDiv = parentDiv.querySelector('label');
                  if (labelInDiv) return labelInDiv.textContent?.trim().toLowerCase();
                }
                return null;
              })();
              
              return el.id === id ||
                     el.name === id ||
                     el.getAttribute('data-test-id') === id ||
                     dataTestAttr === id ||
                     (dataTestAttr && dataTestAttr.toLowerCase().includes(id.toLowerCase())) ||
                     (labelText && labelText.includes(id.toLowerCase()));
            });
          }, identificador);

          if (campoEncontrado) {
            const campoInfo = await page.evaluate((id) => {
              const modal = document.querySelector('div[data-test-modal][role="dialog"]');
              if (!modal) return null;
              const inputs = Array.from(modal.querySelectorAll('input, textarea, select'));
              const input = inputs.find((el: any) => {
                const dataTestAttr = el.getAttribute('data-test-text-selectable-option__input');
                const labelText = (() => {
                  const label = el.id ? modal.querySelector(`label[for="${el.id}"]`) : null;
                  if (label) return label.textContent?.trim().toLowerCase();
                  const parentDiv = el.closest('div');
                  if (parentDiv) {
                    const labelInDiv = parentDiv.querySelector('label');
                    if (labelInDiv) return labelInDiv.textContent?.trim().toLowerCase();
                  }
                  return null;
                })();
                
                return el.id === id ||
                       el.name === id ||
                       el.getAttribute('data-test-id') === id ||
                       dataTestAttr === id ||
                       (dataTestAttr && dataTestAttr.toLowerCase().includes(id.toLowerCase())) ||
                       (labelText && labelText.includes(id.toLowerCase()));
              });
              
              if (input) {
                return {
                  id: (input as HTMLElement).id,
                  name: (input as HTMLElement).getAttribute('name'),
                  dataTest: (input as HTMLElement).getAttribute('data-test-text-selectable-option__input'),
                };
              }
              return null;
            }, identificador).catch(() => null);

            if (campoInfo) {
              if (campoInfo.dataTest) {
                campo = await modal.$(`input[data-test-text-selectable-option__input="${campoInfo.dataTest}"]`).catch(() => null);
              }
              
              if (!campo && campoInfo.id) {
                try {
                  campo = await modal.$(`input#${campoInfo.id.replace(/[#.:()]/g, '\\$&')}`).catch(() => null);
                } catch (e) {
                  campo = await modal.$(`input[id="${campoInfo.id}"]`).catch(() => null);
                }
              }
              
              if (!campo && campoInfo.name) {
                campo = await modal.$(`input[name="${campoInfo.name}"]`).catch(() => null);
              }
            }
          }
        }

        if (!campo) {
          const campoViaLabel = await page.evaluate((id) => {
            const modal = document.querySelector('div[data-test-modal][role="dialog"]');
            if (!modal) return null;
            
            const labels = Array.from(modal.querySelectorAll('label[data-test-text-selectable-option__label]'));
            const label = labels.find((l: Element) => {
              const text = l.textContent?.trim().toLowerCase() || '';
              const dataTest = l.getAttribute('data-test-text-selectable-option__label')?.toLowerCase() || '';
              return text.includes(id.toLowerCase()) || dataTest.includes(id.toLowerCase());
            }) as HTMLLabelElement;
            
            if (label) {
              if (label.htmlFor) {
                const input = modal.querySelector(`input#${CSS.escape(label.htmlFor)}`) as HTMLInputElement;
                return input ? { id: input.id, name: input.name } : null;
              }
              const input = label.querySelector('input') as HTMLInputElement;
              return input ? { id: input.id, name: input.name } : null;
            }
            return null;
          }, identificador).catch(() => null);
          
          if (campoViaLabel) {
            if (campoViaLabel.id) {
              try {
                campo = await modal.$(`input#${campoViaLabel.id.replace(/[#.:()]/g, '\\$&')}`).catch(() => null);
              } catch (e) {
                campo = await modal.$(`input[id="${campoViaLabel.id}"]`).catch(() => null);
              }
            }
            if (!campo && campoViaLabel.name) {
              campo = await modal.$(`input[name="${campoViaLabel.name}"]`).catch(() => null);
            }
          }
        }

        if (!campo) {
          console.log(`⚠️ Campo ${identificador} não encontrado após todas as tentativas`);
          continue;
        }

        const tagName = await campo.evaluate((el: Element) => el.tagName.toLowerCase());
        const campoInfo = await campo.evaluate((el: Element) => {
          const input = el as HTMLInputElement;
          return {
            type: input.type || 'text',
            inputmode: input.inputMode || undefined,
            id: input.id || undefined,
            role: input.getAttribute('role') || undefined,
            ariaAutocomplete: input.getAttribute('aria-autocomplete') || undefined,
            ariaExpanded: input.getAttribute('aria-expanded') || undefined,
            className: input.className || undefined,
          };
        }).catch(() => ({ 
          type: 'text', 
          inputmode: undefined, 
          id: undefined,
          role: undefined,
          ariaAutocomplete: undefined,
          ariaExpanded: undefined,
          className: undefined,
        }));

        const isAutocomplete = campoInfo.role === 'combobox' || 
                               campoInfo.ariaAutocomplete === 'list' ||
                               campoInfo.className?.includes('typeahead') ||
                               campoInfo.id?.toLowerCase().includes('typeahead') ||
                               campoInfo.id?.toLowerCase().includes('autocomplete');

        const isNumeric = campoInfo.inputmode === 'numeric' || 
                          campoInfo.type === 'number' || 
                          campoInfo.id?.toLowerCase().includes('numeric') ||
                          campoInfo.id?.toLowerCase().includes('number');

        if (tagName === 'select') {
          const valorAtual = await campo.evaluate((el: Element) => {
            const select = el as HTMLSelectElement;
            const selectedOption = select.options[select.selectedIndex];
            return {
              value: select.value || '',
              text: selectedOption?.textContent?.trim() || ''
            };
          }).catch(() => ({ value: '', text: '' }));

          const valoresPlaceholder = [
            'select an option',
            'selecione uma opção',
            'selecione',
            'escolha uma opção',
            'choose an option',
            'seleccione una opción',
            ''
          ];

          const valorNormalizado = valorAtual.value.toLowerCase().trim();
          const textoNormalizado = valorAtual.text.toLowerCase().trim();
          const isPlaceholder = valoresPlaceholder.includes(valorNormalizado) || 
                             valoresPlaceholder.some(placeholder => textoNormalizado.includes(placeholder));

          if (!isPlaceholder && valorAtual.value && valorAtual.value.trim() !== '') {
            console.log(`   ⊘ Campo ${identificador} já preenchido: "${valorAtual.value}"`);
            continue;
          }

          try {
            await page.selectOption(`#${identificadorEscaped}`, resposta);
          } catch {
            try {
              await page.selectOption(`[name="${identificador}"]`, resposta);
            } catch {
              await campo.evaluate((el: Element, value: string) => {
                const select = el as HTMLSelectElement;
                const option = Array.from(select.options).find(opt =>
                  opt.textContent?.trim().toLowerCase() === value.toLowerCase() ||
                  opt.value.toLowerCase() === value.toLowerCase() ||
                  opt.textContent?.trim().toLowerCase().includes(value.toLowerCase()) ||
                  opt.value.toLowerCase().includes(value.toLowerCase())
                );
                if (option) {
                  select.value = option.value;
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                  select.dispatchEvent(new Event('input', { bubbles: true }));
                }
              }, resposta);
            }
          }
        } else if (tagName === 'textarea' || (tagName === 'input' && campoInfo.type !== 'checkbox' && campoInfo.type !== 'radio')) {
          if (campoInfo.type === 'file') {
            console.log(`   ⊘ Campo ${identificador} é um campo de arquivo. Ignorando...`);
            continue;
          }
          
          if (identificador.toLowerCase().includes('document-upload') || 
              identificador.toLowerCase().includes('file-input') ||
              identificador.toLowerCase().includes('file-upload') ||
              identificador.toLowerCase().includes('jobs-document-upload')) {
            console.log(`   ⊘ Campo ${identificador} é um campo de upload de arquivo. Ignorando...`);
            continue;
          }
          
          const isVisible = await campo.isVisible().catch(() => false);
          if (!isVisible) {
            console.log(`   ⊘ Campo ${identificador} não está visível. Pulando...`);
            continue;
          }
          
          const valorAtual = await campo.evaluate((el: Element) => {
            const input = el as HTMLInputElement | HTMLTextAreaElement;
            return input.value || '';
          }).catch(() => '');

          if (valorAtual && valorAtual.trim() !== '') {
            console.log(`   ⊘ Campo ${identificador} já preenchido: "${valorAtual.substring(0, 50)}${valorAtual.length > 50 ? '...' : ''}"`);
            continue;
          }

          let respostaFinal = resposta;
          
          if (isNumeric) {
            const numeros = resposta.match(/\d+/);
            if (numeros) {
              respostaFinal = numeros[0];
            } else {
              console.log(`⚠️ Campo ${identificador} é numérico mas resposta não contém números, usando "0"`);
              respostaFinal = '0';
            }
          }

          await campo.click();
          await campo.fill('');
          await campo.type(respostaFinal, { delay: 50 });

          await campo.evaluate((el: Element) => {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });

          if (isAutocomplete) {
            console.log(`   🔍 Campo ${identificador} é autocomplete, aguardando sugestões...`);
            
            try {
              await page.waitForTimeout(800);

              let primeiraOpcaoSelecionada = false;

              const seletoresListbox = [
                '[role="listbox"]',
                '.autocomplete-results',
                '.typeahead-results',
                '[class*="dropdown"]',
                '[class*="suggestions"]',
                'ul[class*="results"]',
                '[class*="typeahead"] ul',
                '[class*="autocomplete"] ul',
              ];

              for (const seletor of seletoresListbox) {
                try {
                  const listbox = await modal.$(seletor).catch(() => null);
                  if (listbox) {
                    const primeiraOpcao = await listbox.$('[role="option"]:first-child, li:first-child, button:first-child, [class*="option"]:first-child, [class*="suggestion"]:first-child').catch(() => null);
                    
                    if (primeiraOpcao) {
                      await primeiraOpcao.click();
                      await page.waitForTimeout(300);
                      
                      await campo.evaluate((el: Element) => {
                        const input = el as HTMLInputElement;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        input.dispatchEvent(new Event('blur', { bubbles: true }));
                      });
                      
                      primeiraOpcaoSelecionada = true;
                      console.log(`   ✓ Primeira opção do autocomplete selecionada (via ${seletor})`);
                      break;
                    }
                  }
                } catch (err) {
                  continue;
                }
              }

              if (!primeiraOpcaoSelecionada) {
                const opcaoSelecionadaViaEvaluate = await page.evaluate((inputId: string) => {
                  const modal = document.querySelector('div[data-test-modal][role="dialog"]');
                  if (!modal) return false;

                  const input = modal.querySelector(`input#${inputId}`) as HTMLInputElement;
                  if (!input) return false;

                  const seletores = [
                    '[role="listbox"]',
                    '.autocomplete-results',
                    '.typeahead-results',
                    '[class*="dropdown"]',
                    '[class*="suggestions"]',
                    'ul[class*="results"]',
                  ];

                  for (const seletor of seletores) {
                    const listbox = modal.querySelector(seletor) as HTMLElement;
                    if (listbox) {
                      const opcoes = listbox.querySelectorAll('[role="option"], li, button, [class*="option"], [class*="suggestion"]');
                      if (opcoes.length > 0) {
                        (opcoes[0] as HTMLElement).click();
                        setTimeout(() => {
                          input.dispatchEvent(new Event('change', { bubbles: true }));
                          input.dispatchEvent(new Event('blur', { bubbles: true }));
                        }, 100);
                        return true;
                      }
                    }
                  }

                  return false;
                }, campoInfo.id || '').catch(() => false);

                if (opcaoSelecionadaViaEvaluate) {
                  primeiraOpcaoSelecionada = true;
                  console.log(`   ✓ Primeira opção selecionada via evaluate`);
                  await page.waitForTimeout(500);
                }
              }

              if (!primeiraOpcaoSelecionada) {
                console.log(`   ⚠️ Tentando selecionar via teclado...`);
                
                try {
                  await campo.focus();
                  await page.waitForTimeout(200);
                  await campo.press('ArrowDown');
                  await page.waitForTimeout(400);
                  await campo.press('Enter');
                  await page.waitForTimeout(300);

                  await campo.evaluate((el: Element) => {
                    const input = el as HTMLInputElement;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                  });

                  console.log(`   ✓ Selecionado via teclado (ArrowDown + Enter)`);
                  await page.waitForTimeout(300);
                } catch (err: any) {
                  console.log(`   ⚠️ Erro ao usar teclado: ${err.message}`);
                }
              }
            } catch (err: any) {
              console.log(`   ⚠️ Erro ao selecionar autocomplete: ${err.message}`);
              
              try {
                await campo.focus();
                await campo.press('ArrowDown');
                await page.waitForTimeout(300);
                await campo.press('Enter');
                await page.waitForTimeout(300);
                console.log(`   ✓ Tentativa alternativa via teclado concluída`);
              } catch (err2) {
                console.log(`   ⚠️ Não foi possível selecionar opção do autocomplete automaticamente`);
              }
            }
          }
        } else if (campoInfo.type === 'checkbox' || campoInfo.type === 'radio') {
          const campoName = await campo.evaluate((el: Element) => {
            return (el as HTMLInputElement).name || '';
          }).catch(() => '');

          const campoId = campoInfo.id || '';
          const dataTestAttr = await campo.evaluate((el: Element) => {
            return (el as HTMLInputElement).getAttribute('data-test-text-selectable-option__input') || '';
          }).catch(() => '');

          if (campoInfo.type === 'radio') {
            if (radioButtonsProcessados.has(campoName)) {
              console.log(`   ⊘ Radio button do grupo "${campoName}" já foi processado`);
              continue;
            }

            const radioJaMarcado = await page.evaluate((name: string) => {
              const modal = document.querySelector('div[data-test-modal][role="dialog"]');
              if (!modal) return false;
              const radios = Array.from(modal.querySelectorAll(`input[type="radio"][name="${name}"]`)) as HTMLInputElement[];
              return radios.some(radio => radio.checked);
            }, campoName).catch(() => false);

            if (radioJaMarcado) {
              console.log(`   ⊘ Radio button do grupo "${campoName}" já está marcado`);
              radioButtonsProcessados.add(campoName);
              continue;
            }

            radioButtonsProcessados.add(campoName);
          }

          const checkedAtual = await campo.evaluate((el: Element) => {
            const input = el as HTMLInputElement;
            return input.checked;
          }).catch(() => false);

          const respostaLower = resposta.toLowerCase().trim();
          const checkedDesejado = respostaLower === 'true' || 
                                  respostaLower === 'sim' ||
                                  respostaLower === 'yes' ||
                                  respostaLower === 'concordo' ||
                                  respostaLower === 'i agree' ||
                                  resposta === '1' ||
                                  respostaLower === 'checked' ||
                                  respostaLower === 'confirmed' ||
                                  respostaLower === 'confirmado' ||
                                  respostaLower === 'agree' ||
                                  respostaLower === 'concordo';

          if (checkedAtual === checkedDesejado && checkedAtual) {
            console.log(`   ⊘ Campo ${identificador} já está ${checkedAtual ? 'marcado' : 'desmarcado'}`);
            continue;
          }

          console.log(`   ✓ Tentando marcar checkbox ${identificador} (checkedDesejado: ${checkedDesejado})...`);

          try {
            await campo.scrollIntoViewIfNeeded();
            await page.waitForTimeout(300);

            let checkboxMarcado = false;

            const tentarMarcarViaLabel = async (): Promise<boolean> => {
              const labelEncontrado = await page.evaluate(({ inputId, inputName, dataTestAttr }: { inputId: string; inputName: string; dataTestAttr: string }) => {
                const modal = document.querySelector('div[data-test-modal][role="dialog"]');
                if (!modal) return false;

                let input: HTMLInputElement | null = null;

                if (inputId) {
                  try {
                    input = modal.querySelector(`input#${CSS.escape(inputId)}`) as HTMLInputElement;
                  } catch (e) {
                    input = Array.from(modal.querySelectorAll('input')).find((el: Element) => {
                      return (el as HTMLInputElement).id === inputId;
                    }) as HTMLInputElement || null;
                  }
                }
                
                if (!input && inputName) {
                  try {
                    input = modal.querySelector(`input[name="${CSS.escape(inputName)}"]`) as HTMLInputElement;
                  } catch (e) {
                    input = Array.from(modal.querySelectorAll('input')).find((el: Element) => {
                      return (el as HTMLInputElement).name === inputName;
                    }) as HTMLInputElement || null;
                  }
                }
                
                if (!input && dataTestAttr) {
                  input = Array.from(modal.querySelectorAll('input[type="checkbox"], input[type="radio"]')).find((el: Element) => {
                    return (el as HTMLInputElement).getAttribute('data-test-text-selectable-option__input') === dataTestAttr;
                  }) as HTMLInputElement || null;
                }

                if (!input) {
                  input = Array.from(modal.querySelectorAll('input[type="checkbox"], input[type="radio"]')).find((el: Element) => {
                    const htmlInput = el as HTMLInputElement;
                    return htmlInput.id === inputId || htmlInput.name === inputName;
                  }) as HTMLInputElement || null;
                }
                
                if (!input && inputId) {
                  const fieldsets = modal.querySelectorAll('fieldset[data-test-checkbox-form-component]');
                  for (const fieldset of Array.from(fieldsets)) {
                    const checkbox = fieldset.querySelector(`input[type="checkbox"]#${CSS.escape(inputId)}`) as HTMLInputElement;
                    if (checkbox) {
                      input = checkbox;
                      break;
                    }
                  }
                }
                
                if (!input && dataTestAttr) {
                  const fieldsets = modal.querySelectorAll('fieldset[data-test-checkbox-form-component]');
                  for (const fieldset of Array.from(fieldsets)) {
                    const checkbox = fieldset.querySelector(`input[data-test-text-selectable-option__input="${dataTestAttr}"]`) as HTMLInputElement;
                    if (checkbox) {
                      input = checkbox;
                      break;
                    }
                  }
                }

                if (!input) return false;

                let label: HTMLLabelElement | null = null;
                
                if (input.id) {
                  try {
                    label = modal.querySelector(`label[for="${CSS.escape(input.id)}"]`) as HTMLLabelElement;
                  } catch (e) {
                    label = Array.from(modal.querySelectorAll('label')).find((el: Element) => {
                      return (el as HTMLLabelElement).htmlFor === input.id;
                    }) as HTMLLabelElement || null;
                  }
                }
                
                if (!label) {
                  const parentDiv = input.closest('div[data-test-text-selectable-option]');
                  if (parentDiv) {
                    label = parentDiv.querySelector('label[data-test-text-selectable-option__label], label') as HTMLLabelElement;
                  }
                }
                
                if (!label) {
                  const parentDiv = input.closest('div');
                  if (parentDiv) {
                    label = parentDiv.querySelector('label') as HTMLLabelElement;
                  }
                }
                
                if (!label) {
                  const fieldset = input.closest('fieldset');
                  if (fieldset) {
                    if (input.id) {
                      try {
                        label = fieldset.querySelector(`label[for="${CSS.escape(input.id)}"]`) as HTMLLabelElement;
                      } catch (e) {
                        label = Array.from(fieldset.querySelectorAll('label')).find((el: Element) => {
                          return (el as HTMLLabelElement).htmlFor === input.id;
                        }) as HTMLLabelElement || null;
                      }
                    }
                    if (!label) {
                      label = fieldset.querySelector('label[data-test-text-selectable-option__label], label') as HTMLLabelElement;
                    }
                  }
                }
                
                if (!label) {
                  label = input.closest('label') as HTMLLabelElement;
                }

                if (label) {
                  label.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  label.click();
                  
                  if (!input.checked) {
                    input.checked = true;
                    input.click();
                  }
                  
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                  input.dispatchEvent(new Event('click', { bubbles: true }));
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  
                  return input.checked;
                }

                return false;
              }, { inputId: campoId, inputName: campoName, dataTestAttr: dataTestAttr }).catch(() => false);

              return labelEncontrado || false;
            };

            checkboxMarcado = await tentarMarcarViaLabel();

            if (checkboxMarcado) {
              console.log(`   ✓ Checkbox marcado via label`);
              await page.waitForTimeout(400);
            } else {
              console.log(`   ⚠️ Não encontrou label, tentando marcar diretamente no input...`);
              
              try {
                await campo.setChecked(checkedDesejado);
                await page.waitForTimeout(200);
                
                await campo.evaluate((el: Element, checked: boolean) => {
                  const input = el as HTMLInputElement;
                  input.checked = checked;
                  input.click();
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                  input.dispatchEvent(new Event('click', { bubbles: true }));
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                }, checkedDesejado);

                await page.waitForTimeout(300);
                checkboxMarcado = true;
              } catch (err: any) {
                console.log(`   ⚠️ Erro ao usar setChecked: ${err.message}`);
              }
            }

            const verificado = await campo.evaluate((el: Element) => {
              return (el as HTMLInputElement).checked;
            }).catch(() => false);

            if (!verificado && !checkboxMarcado) {
              console.log(`   ⚠️ Checkbox não foi marcado, tentando método direto via evaluate...`);
              
              const marcadoViaEvaluate = await page.evaluate(({ inputId, inputName, dataTestAttr, checked }: { inputId: string; inputName: string; dataTestAttr: string; checked: boolean }) => {
                const modal = document.querySelector('div[data-test-modal][role="dialog"]');
                if (!modal) return false;

                let input: HTMLInputElement | null = null;

                if (inputId) {
                  try {
                    input = modal.querySelector(`input#${CSS.escape(inputId)}`) as HTMLInputElement;
                  } catch (e) {
                    input = Array.from(modal.querySelectorAll('input')).find((el: Element) => {
                      return (el as HTMLInputElement).id === inputId;
                    }) as HTMLInputElement || null;
                  }
                }
                
                if (!input && inputName) {
                  try {
                    input = modal.querySelector(`input[name="${CSS.escape(inputName)}"]`) as HTMLInputElement;
                  } catch (e) {
                    input = Array.from(modal.querySelectorAll('input')).find((el: Element) => {
                      return (el as HTMLInputElement).name === inputName;
                    }) as HTMLInputElement || null;
                  }
                }
                
                if (!input && dataTestAttr) {
                  input = Array.from(modal.querySelectorAll('input[type="checkbox"], input[type="radio"]')).find((el: Element) => {
                    return (el as HTMLInputElement).getAttribute('data-test-text-selectable-option__input') === dataTestAttr;
                  }) as HTMLInputElement || null;
                }

                if (!input) {
                  input = Array.from(modal.querySelectorAll('input[type="checkbox"], input[type="radio"]')).find((el: Element) => {
                    const htmlInput = el as HTMLInputElement;
                    return htmlInput.id === inputId || htmlInput.name === inputName;
                  }) as HTMLInputElement || null;
                }
                
                if (!input && inputId) {
                  const fieldsets = modal.querySelectorAll('fieldset[data-test-checkbox-form-component]');
                  for (const fieldset of Array.from(fieldsets)) {
                    const checkbox = fieldset.querySelector(`input[type="checkbox"]#${CSS.escape(inputId)}`) as HTMLInputElement;
                    if (checkbox) {
                      input = checkbox;
                      break;
                    }
                  }
                }
                
                if (!input && dataTestAttr) {
                  const fieldsets = modal.querySelectorAll('fieldset[data-test-checkbox-form-component]');
                  for (const fieldset of Array.from(fieldsets)) {
                    const checkbox = fieldset.querySelector(`input[data-test-text-selectable-option__input="${dataTestAttr}"]`) as HTMLInputElement;
                    if (checkbox) {
                      input = checkbox;
                      break;
                    }
                  }
                }

                if (input) {
                  let label: HTMLLabelElement | null = null;
                  
                  if (input.id) {
                    try {
                      label = modal.querySelector(`label[for="${CSS.escape(input.id)}"]`) as HTMLLabelElement;
                    } catch (e) {
                      label = Array.from(modal.querySelectorAll('label')).find((el: Element) => {
                        return (el as HTMLLabelElement).htmlFor === input.id;
                      }) as HTMLLabelElement || null;
                    }
                  }
                  
                  if (!label) {
                    const parentDiv = input.closest('div[data-test-text-selectable-option]');
                    if (parentDiv) {
                      label = parentDiv.querySelector('label[data-test-text-selectable-option__label], label') as HTMLLabelElement;
                    }
                  }
                  
                  if (!label) {
                    const fieldset = input.closest('fieldset');
                    if (fieldset) {
                      if (input.id) {
                        try {
                          label = fieldset.querySelector(`label[for="${CSS.escape(input.id)}"]`) as HTMLLabelElement;
                        } catch (e) {
                          label = Array.from(fieldset.querySelectorAll('label')).find((el: Element) => {
                            return (el as HTMLLabelElement).htmlFor === input.id;
                          }) as HTMLLabelElement || null;
                        }
                      }
                      if (!label) {
                        label = fieldset.querySelector('label[data-test-text-selectable-option__label], label') as HTMLLabelElement;
                      }
                    }
                  }
                  
                  if (label) {
                    label.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    label.click();
                  } else {
                    input.checked = checked;
                    input.click();
                  }
                  
                  if (!input.checked) {
                    input.checked = checked;
                    input.click();
                  }
                  
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                  input.dispatchEvent(new Event('click', { bubbles: true }));
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  
                  return input.checked;
                }
                return false;
              }, { inputId: campoId, inputName: campoName, dataTestAttr: dataTestAttr, checked: checkedDesejado }).catch(() => false);

              if (marcadoViaEvaluate) {
                console.log(`   ✓ Checkbox marcado via evaluate`);
                checkboxMarcado = true;
                await page.waitForTimeout(400);
              } else {
                console.log(`   ⚠️ Tentando última estratégia: buscar label e clicar diretamente via Playwright...`);
                
                try {
                  let labelElement = null;
                  
                  if (campoId) {
                    try {
                      const campoIdEscaped = campoId.replace(/[#.:()]/g, '\\$&');
                      labelElement = await modal.$(`label[for="${campoIdEscaped}"]`).catch(() => null);
                    } catch (e) {
                      labelElement = await modal.$(`label[for="${campoId}"]`).catch(() => null);
                    }
                  }
                  
                  if (!labelElement && dataTestAttr) {
                    labelElement = await modal.$(`label[data-test-text-selectable-option__label="${dataTestAttr}"]`).catch(() => null);
                  }
                  
                  if (!labelElement) {
                    const labelEncontrado = await page.evaluate(({ inputId, dataTestAttr }: { inputId: string; dataTestAttr: string }) => {
                      const modal = document.querySelector('div[data-test-modal][role="dialog"]');
                      if (!modal) return null;
                      
                      let label: HTMLLabelElement | null = null;
                      
                      if (inputId) {
                        try {
                          label = modal.querySelector(`label[for="${CSS.escape(inputId)}"]`) as HTMLLabelElement;
                        } catch (e) {
                          label = Array.from(modal.querySelectorAll('label')).find((el: Element) => {
                            return (el as HTMLLabelElement).htmlFor === inputId;
                          }) as HTMLLabelElement || null;
                        }
                      }
                      
                      if (!label && dataTestAttr) {
                        label = modal.querySelector(`label[data-test-text-selectable-option__label="${dataTestAttr}"]`) as HTMLLabelElement;
                      }
                      
                      if (label) {
                        return label.getAttribute('data-test-text-selectable-option__label') || label.htmlFor || label.textContent?.trim().substring(0, 50);
                      }
                      return null;
                    }, { inputId: campoId, dataTestAttr: dataTestAttr }).catch(() => null);
                    
                    if (labelEncontrado) {
                      if (dataTestAttr) {
                        labelElement = await modal.$(`label[data-test-text-selectable-option__label="${dataTestAttr}"]`).catch(() => null);
                      }
                      if (!labelElement && campoId) {
                        try {
                          labelElement = await modal.$(`label[for="${campoId.replace(/[#.:()]/g, '\\$&')}"]`).catch(() => null);
                        } catch (e) {
                          labelElement = await modal.$(`label[for="${campoId}"]`).catch(() => null);
                        }
                      }
                    }
                  }
                  
                  if (labelElement) {
                    await labelElement.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(200);
                    await labelElement.click();
                    await page.waitForTimeout(400);
                    
                    const verificadoFinal = await campo.evaluate((el: Element) => {
                      return (el as HTMLInputElement).checked;
                    }).catch(() => false);
                    
                    if (verificadoFinal) {
                      console.log(`   ✓ Checkbox marcado via clique direto no label (Playwright)`);
                      checkboxMarcado = true;
                    } else {
                      await campo.evaluate((el: Element) => {
                        const input = el as HTMLInputElement;
                        input.checked = true;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        input.dispatchEvent(new Event('click', { bubbles: true }));
                      });
                      await page.waitForTimeout(200);
                      checkboxMarcado = true;
                      console.log(`   ✓ Checkbox marcado via label + set checked manual`);
                    }
                  } else {
                    console.log(`   ⚠️ Label não encontrado para clique direto`);
                  }
                } catch (err: any) {
                  console.log(`   ⚠️ Erro na última tentativa: ${err.message}`);
                }
              }
            }

            if (verificado || checkboxMarcado) {
              console.log(`   ✓ Checkbox ${identificador} marcado com sucesso`);
              camposPreenchidos++;
              await page.waitForTimeout(300);
              continue;
            } else {
              const verificadoFinal = await campo.evaluate((el: Element) => {
                return (el as HTMLInputElement).checked;
              }).catch(() => false);
              
              if (verificadoFinal) {
                console.log(`   ✓ Checkbox ${identificador} verificado como marcado`);
                camposPreenchidos++;
                await page.waitForTimeout(300);
                continue;
              } else {
                console.log(`   ⚠️ Não foi possível confirmar se o checkbox foi marcado, mas tentativa foi feita`);
                camposPreenchidos++;
                await page.waitForTimeout(300);
                continue;
              }
            }
          } catch (err: any) {
            console.log(`   ⚠️ Erro ao marcar checkbox ${identificador}: ${err.message}`);
          }
        }

        camposPreenchidos++;
        console.log(`   ✓ Campo ${identificador} preenchido: "${resposta.substring(0, 50)}${resposta.length > 50 ? '...' : ''}"`);
        await page.waitForTimeout(300);
      } catch (err: any) {
        if (identificador.toLowerCase().includes('document-upload') || 
            identificador.toLowerCase().includes('file-input') ||
            identificador.toLowerCase().includes('file-upload') ||
            identificador.toLowerCase().includes('jobs-document-upload')) {
          console.log(`   ⊘ Campo ${identificador} é de upload de arquivo. Ignorando erro...`);
          continue;
        }
        console.log(`⚠️ Erro ao preencher campo ${identificador}:`, err?.message || err);
      }
    }

    if (camposPreenchidos === 0) {
      console.log('ℹ️ Nenhum campo precisou ser preenchido (todos já estavam preenchidos)');
    } else {
      console.log(`✅ ${camposPreenchidos} campo(s) preenchido(s) neste formulário.`);
    }
    
    return camposPreenchidos;
  } catch (err) {
    console.error('❌ Erro ao preencher formulário:', err);
    return 0;
  }
}

function salvarVagaSubmetida(vaga: VagaAnalisada): void {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const vagaComSubmetido: VagaAnalisada = {
      ...vaga,
      submetido: true
    };

    let vagasSubmetidas: VagaAnalisada[] = [];
    if (fs.existsSync(VAGAS_SUBMETIDAS_PATH)) {
      try {
        const conteudoSubmetidas = fs.readFileSync(VAGAS_SUBMETIDAS_PATH, 'utf-8').trim();
        if (conteudoSubmetidas) {
          vagasSubmetidas = JSON.parse(conteudoSubmetidas);
          if (!Array.isArray(vagasSubmetidas)) {
            console.log('⚠️ Arquivo vagas-submetidas.json não contém um array válido. Inicializando novo array.');
            vagasSubmetidas = [];
          }
        }
      } catch (err) {
        console.log('⚠️ Erro ao ler arquivo vagas-submetidas.json. Inicializando novo array.');
        vagasSubmetidas = [];
      }
    }

    const indiceExistente = vagasSubmetidas.findIndex(v => compararVagas(v, vagaComSubmetido));
    
    if (indiceExistente !== -1) {
      vagasSubmetidas[indiceExistente] = vagaComSubmetido;
      console.log('✅ Vaga atualizada em vagas-submetidas.json com submetido: true');
    } else {
      vagasSubmetidas.push(vagaComSubmetido);
      console.log('✅ Vaga salva em vagas-submetidas.json com submetido: true');
    }
    
    fs.writeFileSync(VAGAS_SUBMETIDAS_PATH, JSON.stringify(vagasSubmetidas, null, 2), 'utf-8');

    if (!fs.existsSync(ANALISE_JSON_PATH)) {
      console.error(`❌ Arquivo ${ANALISE_JSON_PATH} não encontrado`);
      return;
    }

    let conteudo = '';
    try {
      conteudo = fs.readFileSync(ANALISE_JSON_PATH, 'utf-8').trim();
      if (!conteudo) {
        console.error(`❌ Arquivo ${ANALISE_JSON_PATH} está vazio`);
        return;
      }
    } catch (err) {
      console.error(`❌ Erro ao ler arquivo ${ANALISE_JSON_PATH}:`, err);
      return;
    }
    
    let vagasAnalisadas: VagaAnalisada[] = [];
    try {
      vagasAnalisadas = JSON.parse(conteudo);
      if (!Array.isArray(vagasAnalisadas)) {
        console.error(`❌ Arquivo ${ANALISE_JSON_PATH} não contém um array válido`);
        return;
      }
    } catch (err) {
      console.error(`❌ Erro ao fazer parse do arquivo ${ANALISE_JSON_PATH}:`, err);
      return;
    }

    const indiceVaga = vagasAnalisadas.findIndex(v => compararVagas(v, vaga));

    if (indiceVaga !== -1) {
      vagasAnalisadas[indiceVaga].submetido = true;
      fs.writeFileSync(ANALISE_JSON_PATH, JSON.stringify(vagasAnalisadas, null, 2), 'utf-8');
      console.log('✅ Vaga marcada como submetida em analise-vagas.json');
    } else {
      console.log('⚠️ Vaga não encontrada em analise-vagas.json');
    }
  } catch (err) {
    console.error('❌ Erro ao salvar vaga submetida:', err);
  }
}

export async function processarSubmissao(page: Page, vaga: VagaAnalisada, cv: string): Promise<boolean> {
  if (typeof cv !== "string" || !cv.trim()) throw new Error("CV_EMPTY");
  try {
    console.log('\n🚀 Iniciando processo de submissão...');
    const sucesso = await fluxoModalSubmissao(page, vaga, cv);
    return sucesso;
  } catch (err) {
    return false;
  }
}
