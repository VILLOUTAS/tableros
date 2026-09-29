// Ejecutar solo desde una consola administrada con la DATABASE_URL existente.
// No crea cuentas ni cambia contraseñas ni proyectos.
import pg from 'pg';
const email='edmundo@villoutas.cl';
if(!process.env.DATABASE_URL)throw new Error('Falta DATABASE_URL de la base existente.');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try {
  const result=await pool.query(`UPDATE app_users SET role='superadmin',roles=ARRAY(SELECT DISTINCT unnest(COALESCE(roles,ARRAY[role]) || ARRAY['admin','superadmin'])),active=TRUE,updated_at=now() WHERE lower(email)=$1 RETURNING id,email`,[email]);
  if(result.rows.length!==1)throw new Error('La cuenta edmundo@villoutas.cl no existe. Créala primero mediante el administrador existente; este comando no crea cuentas.');
  console.log(`Acceso de superadministrador habilitado para ${result.rows[0].email}. Contraseña y proyectos conservados.`);
} finally {await pool.end();}
