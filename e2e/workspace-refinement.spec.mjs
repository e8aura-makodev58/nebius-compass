import {test,expect} from '@playwright/test';
const room='/api/control-rooms/plant-1';
async function pendingDecision(request){
 await request.post(`${room}/mode`,{data:{mode:'LIVE'}});
 await request.post(`${room}/reset`);
 for(let n=0;n<8;n++)await request.post(`${room}/simulation/force-event`);
 await request.post(`${room}/simulation/speed`,{data:{speed:1}});
 await request.post(`${room}/simulation/resume`);
 await expect.poll(async()=>{const s=await(await request.get(`${room}/state`)).json();return s.workforceContinuity.staffingRecommendations.some(r=>r.status==='PENDING');},{timeout:15000}).toBe(true);
 await request.post(`${room}/simulation/pause`);
}
test('short staffing tile exposes approval and prevents duplicate decisions across changing polls',async({page,request})=>{
 await pendingDecision(request);await page.setViewportSize({width:1280,height:900});
 let polls=0,approvals=0;
 await page.route(`**${room}/state`,async route=>{
  const response=await route.fetch(),state=await response.json();
  state.simulationState.simulationTime=new Date(Date.parse(state.simulationState.simulationTime)+ ++polls*6000).toISOString();
  await route.fulfill({json:state});
 });
 await page.route(`**${room}/staffing/*/approve`,async route=>{approvals++;await new Promise(r=>setTimeout(r,2500));await route.continue();});
 await page.goto('/rooms/plant-1');
 const tile=page.locator('#staffing-tile'),approve=tile.getByRole('button',{name:'Approve top option',exact:true});
 await expect(approve).toBeVisible();
 const box=await approve.boundingBox(),bounds=await tile.boundingBox();
 expect(box.y).toBeGreaterThanOrEqual(bounds.y);expect(box.y+box.height).toBeLessThanOrEqual(bounds.y+bounds.height);
 expect(await tile.evaluate(el=>el.scrollTop)).toBe(0);
 await approve.click();await expect(approve).toBeDisabled();await page.waitForTimeout(1800);await expect(approve).toBeDisabled();
 await expect(tile.getByRole('button',{name:'Approve top option'})).toHaveCount(0);
 expect(approvals).toBe(1);
 await tile.locator('[data-staffing-detail=recent] > summary').click();
 await expect(tile).toContainText('Approved by central command');
});
test('phone navigation reaches floor, selected task and decisions directly and preserves nodes across desktop',async({page,request})=>{
 await pendingDecision(request);await page.setViewportSize({width:390,height:844});await page.goto('/rooms/plant-1');
 await expect(page.locator('#issue-list')).toBeVisible();await expect(page.locator('#floor')).toBeHidden();
 await page.evaluate(()=>window.originalMap=document.querySelector('#floor'));
 await page.locator('[data-workspace=staffing]').click();
 await expect(page.locator('[data-decisions-count]')).toHaveText('1');
 const approve=page.locator('#staffing-tile [data-staffing-action=approve]');await expect(approve).toBeVisible();
 const box=await approve.boundingBox();expect(box.y+box.height).toBeLessThan(844);
 await page.locator('[data-workspace=floor]').click();await expect(page.locator('#floor')).toBeVisible();
 await page.locator('#open-control-search').click();await page.locator('#control-search-input').fill('ISS-104');await page.locator('#control-search-input').press('Enter');
 await expect(page.locator('.context-panel')).toBeVisible();await expect(page.locator('#issue-summary')).toContainText('ISS-104');
 await expect(page.locator('[data-workspace=issues]')).toHaveAttribute('aria-pressed','true');
 await page.setViewportSize({width:1280,height:900});await expect(page.locator('#floor-tiles .dv-groupview')).toHaveCount(6);
 expect(await page.evaluate(()=>document.querySelector('#floor')===window.originalMap)).toBe(true);
});
test('analytics puts Pareto before detail tables and preserves expanded evidence and search through polling',async({page,request})=>{
 await request.post(`${room}/mode`,{data:{mode:'LIVE'}});await request.post(`${room}/reset`);
 await page.goto('/rooms/plant-1');await page.locator('#analytics-tab').click();
 await expect(page.locator('#pareto-panel')).toBeVisible();
 expect(await page.evaluate(()=>Boolean(document.querySelector('#pareto-panel').compareDocumentPosition(document.querySelector('#analytics-experience'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 const detail=page.locator('[data-analytics-detail=responders]');await expect(detail).not.toHaveAttribute('open');
 await detail.locator('summary').click();await expect(detail.locator('table')).toBeVisible();
 const search=page.locator('#analytics-equipment-search');await search.fill('Station 3');await page.waitForTimeout(1800);
 await expect(search).toHaveValue('Station 3');await expect(search).toBeFocused();await expect(detail).toHaveAttribute('open','');
 await expect(page.locator('.dashboard-kpis .metric-explanation')).toContainText('Insufficient data (n=0)');
});
test('staffing decision recovers when both submission and immediate refresh fail',async({page,request})=>{
 await pendingDecision(request);await page.goto('/rooms/plant-1');
 const approve=page.locator('#staffing-tile [data-staffing-action=approve]');await expect(approve).toBeVisible();
 await page.route(`**${room}/staffing/*/approve`,route=>route.abort(),{times:1});
 await page.route(`**${room}/state`,route=>route.abort(),{times:1});
 await approve.click();await expect(page.locator('#staffing-tile .staffing-feedback')).not.toHaveText('');
 await expect(approve).toBeEnabled();await approve.click();
 await expect(page.locator('#staffing-tile .staffing-feedback')).toContainText('Approved by central command');
});
