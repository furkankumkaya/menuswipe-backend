#!/bin/bash

CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
GITHUB_TOKEN="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"

# Merge or create config
if [ -f "$CONFIG_PATH" ]; then
  echo "Mevcut config bulundu, merge ediliyor..."
  python3 -c "
import json, sys

with open('$CONFIG_PATH', 'r') as f:
    config = json.load(f)

config.setdefault('mcpServers', {})
config['mcpServers']['github'] = {
    'command': 'npx',
    'args': ['-y', '@modelcontextprotocol/server-github'],
    'env': {
        'GITHUB_PERSONAL_ACCESS_TOKEN': '$GITHUB_TOKEN'
    }
}

with open('$CONFIG_PATH', 'w') as f:
    json.dump(config, f, indent=2)

print('GitHub MCP eklendi.')
"
else
  echo "Config dosyası oluşturuluyor..."
  cat > "$CONFIG_PATH" << EOF
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "$GITHUB_TOKEN"
      }
    }
  }
}
EOF
  echo "Config oluşturuldu."
fi

echo "Tamam! Claude Desktop'ı yeniden başlat."
