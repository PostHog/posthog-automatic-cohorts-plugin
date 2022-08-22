import { PluginEvent, PluginMeta, Plugin } from '@posthog/plugin-scaffold'
import nodeFetch from 'node-fetch'

interface PosthogOptions {
    headers: Record<string, any>
}

type AutomaticCohortsPlugin = Plugin<{
    global: {
        propertiesToTrack: Set<string>
        posthogHost: string
        posthogOptions: PosthogOptions
    }
    config: {
        propertiesToTrack: string
        posthogHost: string
        posthogApiKey: string
        namingConvention: string
    }
}>

type AutomaticCohortsMeta = PluginMeta<AutomaticCohortsPlugin>

interface CohortJobPayload {
    property: string
    value: any
    retriesPerformedSoFar: number
}

interface CreateCohortFromPropertyPayload extends CohortJobPayload {
    meta: AutomaticCohortsMeta
}

export const setupPlugin: AutomaticCohortsPlugin['setupPlugin'] = ({ config, global }) => {
    console.warn('⚠️ This plugin is deprecated! Please move to using group analytics instead. Read more: https://posthog.com/docs/user-guides/group-analytics')
    
    if (!config.namingConvention.includes('<property_value>')) {
        throw new Error('Invalid naming convention! Make sure to include <property_value>.')
    }

    global.posthogHost = config.posthogHost.includes('http') ? config.posthogHost : 'https://' + config.posthogHost

    global.posthogOptions = {
        headers: {
            Authorization: `Bearer ${config.posthogApiKey}`,
            'Content-Type': 'application/json',
        },
    }

    global.propertiesToTrack = new Set(config.propertiesToTrack.split(','))
}
export const onEvent: AutomaticCohortsPlugin['onEvent'] = async (event: PluginEvent, meta) => {
    if (!event.properties && !event.$set && !event.$set_once) {
        return
    }
    const { global } = meta

    const props = Object.entries({
        ...(event.properties!['$set'] || {}),
        ...(event.properties!['$set_once'] || {}),
        ...(event.$set_once || {}),
        ...(event.$set || {}),
    })
    const usefulProperties = props.filter(([key, _]) => global.propertiesToTrack.has(key))

    if (!usefulProperties.length) {
        return
    }

    const [property, value] = usefulProperties[0]
    
    await createCohortFromProperty({ property, value, retriesPerformedSoFar: 0, meta })
}

const createCohortFromProperty = async ({
    property,
    value,
    retriesPerformedSoFar,
    meta,
}: CreateCohortFromPropertyPayload): Promise<void> => {
    const { global, storage, config } = meta

    const hasCohortBeenCreated = await storage.get(`${property}_${value}`, false)
    if (hasCohortBeenCreated) {
        return
    }
    const requestData = {
        id: 'new',
        groups: [{ properties: [{ key: property, value: [value], operator: 'exact', type: 'person' }] }],
        is_static: false,
        name: config.namingConvention.replace('<property_name>', property).replace('<property_value>', value),
    }
    const response = await nodeFetch(`${global.posthogHost}/api/cohort`, {
        ...global.posthogOptions,
        body: JSON.stringify(requestData),
        method: 'POST'
    })

    if (response.ok) {
        await storage.set(`${property}_${value}`, true)
        return
    }

    throw new Error('Failed to create cohort. Response status: ' + response.status)
}
