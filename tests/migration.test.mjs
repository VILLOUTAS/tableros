import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PostgresStore } from '../server.mjs';
import { initializeV5 } from '../v5-server.mjs';

test('PostgreSQL: migración aditiva, repetible, datos históricos intactos y concurrencia por versión',async()=>{
  const pg=await PGlite.create();
  const pool={query:async(sql,params)=>params?pg.query(sql,params):(await pg.exec(sql)).at(-1),connect:async()=>({...pool,release(){}})};
  const store=new PostgresStore('');await store.pool.end();store.pool=pool;
  const owner=randomUUID(),id=randomUUID(),payload={materialId:'original',settings:{calculationVersion:'4.1'},pieces:[{length:445,width:758,quantity:2,grain:'longitudinal'}]},summary={net:32123,vat:6103,total:38226};
  try {
    await pg.exec(`CREATE TABLE app_users(id UUID PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,full_name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','comercial','produccion','cliente')),client_name TEXT NOT NULL DEFAULT '',active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE projects(id UUID PRIMARY KEY,owner_id UUID NOT NULL REFERENCES app_users(id),assigned_to UUID REFERENCES app_users(id),project_name TEXT NOT NULL DEFAULT '',client_name TEXT NOT NULL,rut TEXT NOT NULL DEFAULT '',status TEXT NOT NULL CHECK(status IN ('cotizacion','venta','facturacion','facturado_pagado','produccion','despacho','entregado')),payload JSONB NOT NULL DEFAULT '{}',summary JSONB,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());`);
    await pg.query(`INSERT INTO app_users(id,email,password_hash,full_name,role) VALUES($1,'edmundo@villoutas.cl','hash-de-prueba','Edmundo','admin')`,[owner]);
    await pg.query(`INSERT INTO projects(id,owner_id,client_name,status,payload,summary)VALUES($1,$2,'Cliente histórico','cotizacion',$3,$4)`,[id,owner,JSON.stringify(payload),JSON.stringify(summary)]);
    const before=(await pg.query('SELECT * FROM projects')).rows[0];
    await store.init();await initializeV5(store);await store.init();await initializeV5(store);
    const after=(await pg.query('SELECT * FROM projects')).rows[0];
    for(const key of Object.keys(before))assert.deepEqual(after[key],before[key],`Cambió ${key}`);
    assert.equal((await store.getUser(owner)).role,'superadmin');
    assert.equal((await store.getUser(owner)).roles.filter(r=>r==='superadmin').length,1);
    assert.equal((await store.getProject(id)).rowVersion,0);
    const record={id,ownerId:owner,project:{clientName:'Cliente corregido',projectName:'Proyecto',rut:'',status:'cotizacion'},payload,summary,expectedVersion:0};
    const saved=await store.saveProject(record);assert.equal(saved.rowVersion,1);assert.equal(saved.summary.net,32123);
    await assert.rejects(()=>store.saveProject({...record,project:{...record.project,clientName:'Datos obsoletos'}}),e=>e.status===409);
    assert.equal((await store.getProject(id)).project.clientName,'Cliente corregido');
    await store.putV5('config',{origin:{address:'Origen de prueba'}});assert.equal((await store.getV5('config')).origin.address,'Origen de prueba');
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM projects')).rows[0].n,1);
  } finally {await pg.close();}
});
