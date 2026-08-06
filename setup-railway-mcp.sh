#!/bin/bash

echo "Railway CLI kuruluyor..."
npm install -g @railway/cli

# railway binary'nin tam yolunu bul
RAILWAY_BIN=$(which railway)
echo "Railway path: $RAILWAY_BIN"

CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
RAILWAY_TOKEN="b5d8305b-48b9-4763-bdeb-fce6a79f26e9"

python3 << PYEOF
import json

with open('$CONFIG_PATH', 'r') as f:
    config = json.load(f)

config.setdefault('mcpServers', {})
config['mcpServers']['railway'] = {
    'command': '$RAILWAY_BIN',
    'args': ['mcp'],
    'env': {
        'RAILWAY_TOKEN': '$RAILWAY_TOKEN'
    }
}

with open('$CONFIG_PATH', 'w') as f:
    json.dump(config, f, indent=2)

print('Railway MCP guncellendi, path: $RAILWAY_BIN')
PYEOF

echo "Config guncellendi. Claude Desktop'i yeniden baslatın."
