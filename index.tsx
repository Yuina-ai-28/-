/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';
import { Chart } from 'chart.js';

// --- DOM Elements ---
const goalInput = document.getElementById('goal') as HTMLInputElement;
const analyzeButton = document.getElementById('analyze-button') as HTMLButtonElement;
const outputContent = document.getElementById('output-content') as HTMLDivElement;
const chartContainer = document.getElementById('chart-container') as HTMLDivElement;
const chartCanvas = document.getElementById('metrics-chart') as HTMLCanvasElement;
const buttonText = document.querySelector('#analyze-button .button-text') as HTMLSpanElement;
const spinner = document.querySelector('#analyze-button .spinner') as HTMLDivElement;

const myInputs = {
  impressions: document.getElementById('my-impressions') as HTMLInputElement,
  clicks: document.getElementById('my-clicks') as HTMLInputElement,
  cost: document.getElementById('my-cost') as HTMLInputElement,
  conversions: document.getElementById('my-conversions') as HTMLInputElement,
  region: document.getElementById('my-region') as HTMLSelectElement,
  memo: document.getElementById('my-memo') as HTMLTextAreaElement,
};

const marketInputs = {
    marriages: document.getElementById('market-marriages') as HTMLInputElement,
    spend: document.getElementById('market-spend') as HTMLInputElement,
    trends: document.getElementById('market-trends') as HTMLTextAreaElement,
};

const competitorToggle = document.getElementById('competitor-toggle') as HTMLInputElement;
const competitorCard = document.getElementById('competitor-card') as HTMLDivElement;

const compInputs = {
  impressions: document.getElementById('comp-impressions') as HTMLInputElement,
  clicks: document.getElementById('comp-clicks') as HTMLInputElement,
  cost: document.getElementById('comp-cost') as HTMLInputElement,
  conversions: document.getElementById('comp-conversions') as HTMLInputElement,
  region: document.getElementById('comp-region') as HTMLSelectElement,
};

const myCalculatedMetrics = document.getElementById('my-calculated-metrics') as HTMLDivElement;
const compCalculatedMetrics = document.getElementById('comp-calculated-metrics') as HTMLDivElement;

// --- Chart Instance ---
let chartInstance: Chart | null = null;

// --- Gemini AI Setup ---
let ai: GoogleGenAI;
try {
  ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
} catch (error) {
    showError('GoogleGenAIの初期化に失敗しました。APIキーが正しく設定されていることを確認してください。');
    console.error(error);
}

// --- Event Listeners ---
analyzeButton.addEventListener('click', handleAnalysis);
Object.values(myInputs).forEach(input => {
    if(input.id !== 'my-memo') {
        input.addEventListener('input', () => updateCalculatedMetrics(myInputs, myCalculatedMetrics))
    }
});
Object.values(compInputs).forEach(input => input.addEventListener('input', () => updateCalculatedMetrics(compInputs, compCalculatedMetrics)));
competitorToggle.addEventListener('change', () => {
    competitorCard.style.display = competitorToggle.checked ? 'block' : 'none';
});


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    updateCalculatedMetrics(myInputs, myCalculatedMetrics);
    updateCalculatedMetrics(compInputs, compCalculatedMetrics);
});


// --- Functions ---
function setLoading(isLoading: boolean) {
  analyzeButton.disabled = isLoading;
  if (isLoading) {
    buttonText.textContent = '分析中...';
    spinner.style.display = 'block';
  } else {
    // FIX: Corrected a typo in the variable name from `button-text` to `buttonText`.
    buttonText.textContent = 'パフォーマンスを分析';
    spinner.style.display = 'none';
  }
}

function showError(message: string) {
    outputContent.classList.remove('placeholder');
    outputContent.innerHTML = `<div class="error">${message}</div>`;
    chartContainer.style.display = 'none';
}

function getNumericValue(element: HTMLInputElement): number {
    return parseFloat(element.value) || 0;
}

function updateCalculatedMetrics(inputs: typeof myInputs | typeof compInputs, outputEl: HTMLElement) {
    const impressions = getNumericValue(inputs.impressions);
    const clicks = getNumericValue(inputs.clicks);
    const cost = getNumericValue(inputs.cost);
    const conversions = getNumericValue(inputs.conversions);

    const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0.00';
    const cpa = conversions > 0 ? (cost / conversions).toFixed(2) : '0.00';

    outputEl.innerHTML = `
        <span class="metric-tag"><span class="label">CTR:</span> ${ctr}%</span>
        <span class="metric-tag"><span class="label">CPA:</span> ¥${cpa}</span>
    `;
}

interface CampaignData {
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    region: string;
    ctr: string;
    cpa: string;
    memo?: string;
}

interface MarketData {
    marriages: number;
    avgSpend: number;
    trends: string;
}


function getCampaignData(inputs: typeof myInputs | typeof compInputs, memo?: string): CampaignData {
    const impressions = getNumericValue(inputs.impressions);
    const clicks = getNumericValue(inputs.clicks);
    const cost = getNumericValue(inputs.cost);
    const conversions = getNumericValue(inputs.conversions);
    const region = inputs.region.value;

    const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0.00';
    const cpa = conversions > 0 ? (cost / conversions).toFixed(2) : '0.00';

    const data: CampaignData = { impressions, clicks, cost, conversions, region, ctr, cpa };
    if (memo) {
        data.memo = memo;
    }
    return data;
}

function getMarketData(inputs: typeof marketInputs): MarketData {
    const marriages = getNumericValue(inputs.marriages);
    const avgSpend = getNumericValue(inputs.spend);
    const trends = inputs.trends.value;
    return { marriages, avgSpend, trends };
}


function buildPrompt(
  goal: string,
  myData: CampaignData,
  marketData: MarketData,
  compData?: CampaignData
): string {
  const memoSection = myData.memo
    ? `- 広告構成・変更点メモ: ${myData.memo}`
    : '';

  const competitorSection = compData
    ? `
**競合キャンペーンデータ:**
- 地域: ${compData.region}
- インプレッション数: ${compData.impressions.toLocaleString()}
- クリック数: ${compData.clicks.toLocaleString()}
- 総費用: ¥${compData.cost.toLocaleString()}
- コンバージョン数: ${compData.conversions.toLocaleString()}
- クリックスルー率 (CTR): ${compData.ctr}%
- 顧客獲得単価 (CPA): ¥${compData.cpa}`
    : '';

  const competitorAnalysisInstructions = compData
    ? '競合のデータも踏まえ、自社キャンペーンの相対的な強みと弱みを分析に含めてください。'
    : '';

  const chartDataPrompt = compData
    ? `
マークダウン分析の後、棒グラフ用のデータを単一のJSONコードブロックで提供してください。JSONは以下の正確な構造でなければなりません。
\`\`\`json
{
  "labels": ["クリック数", "コンバージョン数", "CTR (%)", "CPA (¥)"],
  "datasets": [
    {
      "label": "自社キャンペーン",
      "data": [${myData.clicks}, ${myData.conversions}, ${myData.ctr}, ${myData.cpa}],
      "backgroundColor": "rgba(66, 133, 244, 0.8)"
    },
    {
      "label": "競合キャンペーン",
      "data": [${compData.clicks}, ${compData.conversions}, ${compData.ctr}, ${compData.cpa}],
      "backgroundColor": "rgba(219, 68, 55, 0.8)"
    }
  ]
}
\`\`\``
    : '';

  return `
あなたは日本のブライダル業界に特化したデジタルのマーケティングコンサルタントです。提供されたデータを基に、プロの視点から広告運用の分析と戦略立案を行ってください。メモの内容も重要な情報として分析に含めてください。

**私の主な目標:**
${goal || '指定なし'}

**自社キャンペーンデータ:**
- 地域: ${myData.region}
- インプレッション数: ${myData.impressions.toLocaleString()}
- クリック数: ${myData.clicks.toLocaleString()}
- 総費用: ¥${myData.cost.toLocaleString()}
- コンバージョン数: ${myData.conversions.toLocaleString()}
- クリックスルー率 (CTR): ${myData.ctr}%
- 顧客獲得単価 (CPA): ¥${myData.cpa}
${memoSection}

**対象県のブライダルマーケット状況:**
- 年間婚姻数: ${marketData.marriages.toLocaleString()} 組
- 平均顧客単価: ¥${marketData.avgSpend.toLocaleString()}
- 市場トレンド: ${marketData.trends || '特に指定なし'}
${competitorSection}

以下の構成で、詳細な分析レポートをマークダウン形式で作成してください。
${competitorAnalysisInstructions}

1.  **要約:**
    キャンペーン全体のパフォーマンスとマーケット状況をまとめた簡潔なサマリー。

2.  **良い結果の背景:**
    今回のキャンペーンで成果が出ている点（例：CTRが高い、CPAが低いなど）を特定し、その成功要因を具体的に分析してください。

3.  **課題点のピックアップと改善点:**
    目標達成を妨げている可能性のある課題（例：コンバージョン率が低い、クリック単価が高いなど）をデータから抽出し、それぞれの具体的な改善策を提示してください。

4.  **次月に向けた全体の改善策:**
    *   **予算変更の提案:** 現状のパフォーマンスと目標に基づき、来月の予算を増額、減額、あるいは維持すべきか提案してください。
    *   **新しい広告メニューの導入案:** 例えば、Instagramリール広告、YouTube動画広告、インフルエンサーマーケティングなど、ブライダル業界で効果が期待できる新しい広告手法を具体的に提案してください。

5.  **今後の動きに合わせた配信戦略立案:**
    現在の予算配分とマーケット状況（季節性、競合の動きなど）を考慮し、今後予測される市場の変化に対応するための具体的な配信戦略を立案してください。
${chartDataPrompt}
  `;
}

function renderChart(chartData: any) {
    if (chartInstance) {
        chartInstance.destroy();
    }
    chartContainer.style.display = 'block';
    chartInstance = new Chart(chartCanvas, {
        type: 'bar',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}


async function handleAnalysis() {
  if (!ai) {
    showError('AIモデルが初期化されていません。詳細はコンソールを確認してください。');
    return;
  }
  
  setLoading(true);
  outputContent.classList.remove('placeholder');
  outputContent.innerHTML = '';
  if (chartInstance) {
      chartInstance.destroy();
  }
  chartContainer.style.display = 'none';

  const goal = goalInput.value.trim();
  const myData = getCampaignData(myInputs, myInputs.memo.value);
  const marketData = getMarketData(marketInputs);
  let compData: CampaignData | undefined = undefined;
  
  if (competitorToggle.checked) {
      compData = getCampaignData(compInputs);
  }

  const prompt = buildPrompt(goal, myData, marketData, compData);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    let text = response.text;

    // Extract JSON for chart only if competitor analysis is on
    if (competitorToggle.checked) {
        const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
        const jsonMatch = text.match(jsonRegex);

        if (jsonMatch && jsonMatch[1]) {
            try {
                const chartData = JSON.parse(jsonMatch[1]);
                renderChart(chartData);
                // Remove the json block from the text to be rendered as markdown
                text = text.replace(jsonRegex, '').trim();
            } catch (e) {
                console.error("Failed to parse chart JSON:", e);
                // Don't show chart, but still show the text content
                chartContainer.style.display = 'none';
            }
        }
    }
    
    outputContent.innerHTML = marked.parse(text) as string;
  } catch (error) {
    console.error('Error during API call:', error);
    showError('データの分析中にエラーが発生しました。もう一度お試しください。');
  } finally {
    setLoading(false);
  }
}