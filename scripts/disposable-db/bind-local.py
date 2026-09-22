"""Recreate only this disposable project's containers with explicit loopback ports.

Docker Desktop can ignore a bridge's default host binding. Keep credentials in
the ignored runtime directory; never print the generated Compose configuration.
"""
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
NAMES = [f'supabase_{service}_stockerai-disposable' for service in ('db', 'kong', 'auth', 'rest')]
NETWORK = 'stockerai-disposable-local'


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True)


def main():
    instances = json.loads(docker('inspect', *NAMES))
    services, volumes = {}, {}
    for instance in instances:
        name = instance['Name'].lstrip('/')
        assert name in NAMES
        config = instance['Config']
        assert config['Labels']['com.supabase.cli.project'] == 'stockerai-disposable'
        assert list(instance['NetworkSettings']['Networks']) == [NETWORK]
        service = {
            'image': config['Image'], 'container_name': name,
            'environment': config['Env'], 'labels': config['Labels'],
            'networks': {'local': {'aliases': instance['NetworkSettings']['Networks'][NETWORK]['Aliases'] or []}},
        }
        if name != 'supabase_db_stockerai-disposable':
            service['depends_on'] = {'supabase_db_stockerai-disposable': {'condition': 'service_healthy'}}
        for source, target in [('Entrypoint', 'entrypoint'), ('Cmd', 'command'), ('WorkingDir', 'working_dir'), ('User', 'user')]:
            if config.get(source):
                service[target] = config[source]
        if config.get('Healthcheck'):
            health = config['Healthcheck']
            service['healthcheck'] = {'test': health['Test']}
            for key in ('Interval', 'Timeout', 'StartPeriod'):
                if health.get(key):
                    service['healthcheck'][{'Interval':'interval','Timeout':'timeout','StartPeriod':'start_period'}[key]] = f'{health[key]}ns'
            if health.get('Retries'):
                service['healthcheck']['retries'] = health['Retries']
        service['ports'] = [f"127.0.0.1:{binding['HostPort']}:{port}" for port, bindings in (instance['HostConfig']['PortBindings'] or {}).items() for binding in bindings]
        service['volumes'] = []
        for mount in instance['Mounts']:
            assert mount['Type'] == 'volume', 'Review unexpected bind mount before recreation'
            volume = mount['Name']
            assert 'stockerai-disposable' in volume
            volumes[volume] = {'external': True}
            service['volumes'].append(f"{volume}:{mount['Destination']}" + ('' if mount['RW'] else ':ro'))
        if name == 'supabase_kong_stockerai-disposable':
            config_dir = ROOT / '.test-runtime/disposable/kong'
            config_dir.mkdir(parents=True, exist_ok=True)
            for filename in ('kong.yml', 'localhost.crt', 'localhost.key'):
                destination = config_dir / filename
                docker('cp', f'{name}:/home/kong/{filename}', str(destination))
                service['volumes'].append({'type': 'bind', 'source': str(destination), 'target': f'/home/kong/{filename}', 'read_only': True})
        services[name] = service
    path = ROOT / '.test-runtime/disposable/compose.json'
    path.write_text(json.dumps({'services': services, 'volumes': volumes, 'networks': {'local': {'external': True, 'name': NETWORK}}}).replace('$', '$$'), encoding='utf-8')
    docker('compose', '-p', 'stockerai-disposable', '-f', str(path), 'config', '--quiet')
    # Exact allowlist; retain the schema volume and all unrelated containers.
    docker('stop', *NAMES)
    docker('rm', *NAMES)
    subprocess.run(['docker', 'compose', '-p', 'stockerai-disposable', '-f', str(path), 'up', '-d'], check=True)
    print('Disposable services recreated with explicit loopback ports; credentials were not printed.')


if __name__ == '__main__':
    main()
