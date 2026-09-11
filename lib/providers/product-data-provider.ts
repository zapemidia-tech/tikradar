import type{Creator,Live,Product,Shop,Video}from '@/types';
export interface ProductDataProvider{getProducts():Promise<Product[]>;getProduct(id:string):Promise<Product|null>;getProductMetrics(id:string):Promise<Product['history']>;getCreators():Promise<Creator[]>;getShops():Promise<Shop[]>;getVideos():Promise<Video[]>;getLives():Promise<Live[]>}
