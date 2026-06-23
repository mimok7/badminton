const fs = require('fs');
const https = require('https');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env.local');
const outputPath = path.join(projectRoot, 'src', 'types', 'supabase.ts');

function readEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

function fetchOpenApiSpec(url, apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      `${url}/rest/v1/`,
      {
        method: 'GET',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`OpenAPI fetch failed with status ${res.statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

function toTsIdentifier(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : `'${value}'`;
}

function formatBlock(lines, indentLevel = 0) {
  const indent = '  '.repeat(indentLevel);
  return lines.map((line) => `${indent}${line}`).join('\n');
}

function mapSchemaType(schema) {
  if (!schema) {
    return 'Json';
  }

  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    return `Database['public']['Tables'][${JSON.stringify(refName)}]['Row']`;
  }

  if (schema.type === 'array') {
    return `${mapSchemaType(schema.items)}[]`;
  }

  if (schema.type === 'object') {
    if (schema.properties) {
      const objectLines = Object.entries(schema.properties).map(([key, value]) => {
        const propertySchema = value || {};
        return `${toTsIdentifier(key)}: ${mapSchemaType(propertySchema)};`;
      });
      return `{\n${formatBlock(objectLines, 1)}\n}`;
    }

    return 'Json';
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    return 'number';
  }

  if (schema.type === 'boolean') {
    return 'boolean';
  }

  if (schema.format === 'json' || schema.format === 'jsonb') {
    return 'Json';
  }

  return 'string';
}

function hasImplicitGeneratedValue(schema) {
  if (!schema) {
    return false;
  }

  const description = typeof schema.description === 'string' ? schema.description : '';
  const isPrimaryKey = description.includes('<pk/>');
  const isNumeric = schema.type === 'integer' || schema.type === 'number';

  // Supabase OpenAPI sometimes omits defaults for BIGSERIAL/BIGINT PKs.
  return isPrimaryKey && isNumeric;
}

function buildRowShape(definition) {
  const required = new Set(definition.required || []);
  const properties = definition.properties || {};

  return Object.entries(properties).map(([key, schema]) => {
    const propertySchema = schema || {};
    const baseType = mapSchemaType(propertySchema);
    const isRequired = required.has(key);
    const type = isRequired ? baseType : `${baseType} | null`;
    return `${toTsIdentifier(key)}: ${type};`;
  });
}

function buildInsertShape(definition) {
  const required = new Set(definition.required || []);
  const properties = definition.properties || {};

  return Object.entries(properties).map(([key, schema]) => {
    const propertySchema = schema || {};
    const baseType = mapSchemaType(propertySchema);
    const hasDefault = Object.prototype.hasOwnProperty.call(propertySchema, 'default');
    const isImplicitGenerated = hasImplicitGeneratedValue(propertySchema);
    const isRequired = required.has(key) && !hasDefault && !isImplicitGenerated;
    const isNullable = !required.has(key);
    const type = isNullable ? `${baseType} | null` : baseType;
    return isRequired
      ? `${toTsIdentifier(key)}: ${type};`
      : `${toTsIdentifier(key)}?: ${type};`;
  });
}

function buildUpdateShape(definition) {
  const properties = definition.properties || {};

  return Object.entries(properties).map(([key, schema]) => {
    const propertySchema = schema || {};
    const baseType = mapSchemaType(propertySchema);
    return `${toTsIdentifier(key)}?: ${baseType} | null;`;
  });
}

function buildTableEntry(name, definition) {
  const rowLines = buildRowShape(definition);
  const insertLines = buildInsertShape(definition);
  const updateLines = buildUpdateShape(definition);

  return [
    `${JSON.stringify(name)}: {`,
    formatBlock(['Row: {', formatBlock(rowLines, 1), '};'], 1),
    formatBlock(['Insert: {', formatBlock(insertLines, 1), '};'], 1),
    formatBlock(['Update: {', formatBlock(updateLines, 1), '};'], 1),
    formatBlock(['Relationships: [];'], 1),
    `};`,
  ].join('\n');
}

function buildViewEntry(name, definition) {
  const rowLines = buildRowShape(definition);

  return [
    `${JSON.stringify(name)}: {`,
    formatBlock(['Row: {', formatBlock(rowLines, 1), '};'], 1),
    formatBlock(['Relationships: [];'], 1),
    `};`,
  ].join('\n');
}

function classifyResources(paths) {
  const tables = new Set();
  const views = new Set();

  for (const [route, operations] of Object.entries(paths || {})) {
    if (!route.startsWith('/') || route === '/' || route.startsWith('/rpc/')) {
      continue;
    }

    const name = route.slice(1);
    const methods = Object.keys(operations || {}).map((method) => method.toLowerCase());
    const isTable = methods.some((method) => ['post', 'patch', 'delete'].includes(method));

    if (isTable) {
      tables.add(name);
    } else {
      views.add(name);
    }
  }

  return { tables, views };
}

function buildFunctionEntries(paths) {
  const manualReturnTypes = {
    check_profile_connection: 'Json',
    daily_match_generation: 'Json',
    get_all_users: 'Json[]',
    get_available_profiles:
      '{ username: string | null; skill_level: string | null; skill_label: string | null; }[]',
    get_my_role: 'string | null',
  };

  const functionNames = new Set(
    Object.keys(paths || {})
      .filter((route) => route.startsWith('/rpc/'))
      .map((route) => route.replace('/rpc/', ''))
  );

  Object.keys(manualReturnTypes).forEach((name) => functionNames.add(name));

  return Array.from(functionNames)
    .sort()
    .map((name) => {
      const returnType = manualReturnTypes[name] || 'Json';
      return [
        `${JSON.stringify(name)}: {`,
        formatBlock(['Args: Record<string, never>;'], 1),
        formatBlock([`Returns: ${returnType};`], 1),
        `};`,
      ].join('\n');
    });
}

async function main() {
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local 파일을 찾을 수 없습니다.');
  }

  const env = readEnvFile(envPath);
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase URL 또는 service role key가 설정되어 있지 않습니다.');
  }

  const spec = await fetchOpenApiSpec(supabaseUrl, serviceRoleKey);
  const definitions = spec.definitions || {};
  const { tables, views } = classifyResources(spec.paths || {});

  const tableEntries = Array.from(tables)
    .filter((name) => definitions[name])
    .sort()
    .map((name) => buildTableEntry(name, definitions[name]));

  const viewEntries = Array.from(views)
    .filter((name) => definitions[name])
    .sort()
    .map((name) => buildViewEntry(name, definitions[name]));

  const functionEntries = buildFunctionEntries(spec.paths || {});

  const output = `/* eslint-disable */\nexport type Json =\n  | string\n  | number\n  | boolean\n  | null\n  | { [key: string]: Json | undefined }\n  | Json[];\n\nexport type Database = {\n  public: {\n    Tables: {\n${formatBlock(tableEntries, 3)}\n    };\n    Views: {\n${formatBlock(viewEntries, 3)}\n    };\n    Functions: {\n${formatBlock(functionEntries, 3)}\n    };\n    Enums: Record<string, never>;\n    CompositeTypes: Record<string, never>;\n  };\n};\n`;

  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`Generated ${path.relative(projectRoot, outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
