# Vigia: sai quando a coleta 212 terminar (ou após ~5h de guarda)
for i in $(seq 1 60); do
  running=$(node -e "try{const p=require('./output/scrape-all-progress.json');console.log(p.running?'1':'0')}catch{console.log('0')}")
  if [ "$running" = "0" ]; then
    echo "COLETA_TERMINOU"
    node -e "try{const p=require('./output/scrape-all-progress.json');console.log(JSON.stringify(p))}catch{}"
    exit 0
  fi
  sleep 300
done
echo "VIGIA_EXPIROU_AINDA_RODANDO"
