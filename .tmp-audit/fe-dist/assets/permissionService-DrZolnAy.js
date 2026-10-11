import{e as t}from"./index-D8tUvgIX.js";class i{async getAll(){return(await t("/api/permissions")).data}async getById(a){return(await this.getAll()).find(s=>s.id===a)}async getByName(a){return(await this.getAll()).find(s=>s.name===a)}}const r=new i;export{r as p};
//# sourceMappingURL=permissionService-DrZolnAy.js.map
