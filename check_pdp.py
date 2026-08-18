import json

# Tenta ler do arquivo de testes
try:
    with open('output/extra/teste_categoria.json', encoding='utf-8') as f:
        d = json.load(f)
    
    print('=== teste_categoria.json ===')
    print(f'Chaves: {list(d.keys())}')
    
    if 'dados' in d:
        data = d['dados']
        print(f'Total: {len(data)} produtos')
        pdp_count = sum(1 for p in data if isinstance(p, dict) and p.get('fotos_pdp'))
        print(f'Com fotos_pdp: {pdp_count}')
        
        if pdp_count > 0:
            sample = next((p for p in data if isinstance(p, dict) and p.get('fotos_pdp')), None)
            if sample:
                print(f'Amostra: product_id={sample.get("product_id")}, fotos_pdp_count={len(sample["fotos_pdp"])}')
                print(f'Preço: {sample.get("preco_venda")}, Original: {sample.get("preco_original")}')
        
        # Mostra os 2 PDPs que deveriam ter sido coletados
        known_pdps = ['1735026218668098978', '1736415534291781098']
        for pdp_id in known_pdps:
            p = next((p for p in data if isinstance(p, dict) and p.get('product_id') == pdp_id), None)
            if p:
                print(f'\nProduto {pdp_id}:')
                print(f'  fotos_pdp: {len(p.get("fotos_pdp", []))} imagens')
                print(f'  preco_venda: {p.get("preco_venda")}')

except Exception as e:
    print(f'Erro: {e}')
